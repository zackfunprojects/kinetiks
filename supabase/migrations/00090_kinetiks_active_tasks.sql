-- ============================================================
-- 00090_kinetiks_active_tasks.sql
--
-- Phase 8.0 — Collaborative Workspace task drawer (spec §8).
--
-- The in-flight task surfaced by the task drawer: what the system is doing,
-- which app, which step, progress, and the kill record. Status is a
-- state-bearing entity with three-layer enforcement (server action
-- assertTransition + this trigger + RLS), mirroring kinetiks_authority_grants:
--
--   active  -> paused | killed | completed
--   paused  -> active | killed | completed
--   killed, completed  (terminal)
--
-- Only ONE active/paused task per thread (the panel is thread-scoped,
-- spec §17.1) — enforced by a unique partial index.
--
-- Kill records (kill_reason_code, kill_feedback) capture the "What went
-- wrong?" prompt (§8.3); the high-weight kill *signal* is a separate
-- kinetiks_ledger entry (event_type='task_killed', 2x weight).
--
-- RLS: account-scoped reads; service-role writes (the command pipeline +
-- embed API routes write under service role).
-- ============================================================

CREATE TABLE kinetiks_active_tasks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  thread_id          text NOT NULL,
  team_scope_id      text,                      -- v2 placeholder; null in v1

  name               text NOT NULL,
  description        text,
  app_name           text NOT NULL,

  status             text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','paused','killed','completed')),
  progress           integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_step_index integer NOT NULL DEFAULT 0,
  steps              jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ActiveTaskStep[]

  command_id         text,                       -- correlation to the dispatch plan

  -- Kill record (the "What went wrong?" prompt, §8.3)
  kill_reason_code   text
                     CHECK (kill_reason_code IS NULL OR
                            kill_reason_code IN ('wrong_tone','wrong_data','wrong_approach','wrong_target','other')),
  kill_feedback      text,

  source_app         text NOT NULL DEFAULT 'kinetiks_fixtures',
  started_at         timestamptz NOT NULL DEFAULT now(),
  ended_at           timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CHECK (jsonb_typeof(steps) = 'array'),
  -- terminal states stamp ended_at
  CHECK (status NOT IN ('killed','completed') OR ended_at IS NOT NULL)
);

COMMENT ON TABLE kinetiks_active_tasks IS
  'Collaborative-workspace task drawer (spec §8). One active/paused task per thread. Status is state-machine enforced (server action + trigger + RLS). Kill record captures the "What went wrong?" prompt; the 2x kill signal is a separate kinetiks_ledger task_killed entry.';

-- One active/paused task per thread (panel is thread-scoped, §17.1)
CREATE UNIQUE INDEX idx_active_tasks_one_per_thread
  ON kinetiks_active_tasks (account_id, thread_id)
  WHERE status IN ('active','paused');

CREATE INDEX idx_active_tasks_thread
  ON kinetiks_active_tasks (account_id, thread_id);

CREATE INDEX idx_active_tasks_source_app
  ON kinetiks_active_tasks (source_app);

-- ── updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION _kt_active_tasks_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS active_tasks_touch_updated_at ON kinetiks_active_tasks;
CREATE TRIGGER active_tasks_touch_updated_at
  BEFORE UPDATE ON kinetiks_active_tasks
  FOR EACH ROW
  EXECUTE FUNCTION _kt_active_tasks_touch_updated_at();

-- ── Lifecycle state-machine trigger (backstop) ──────────────
-- Mirror of apps/id/src/lib/state-machines-init.ts kinetiks_active_tasks.
CREATE OR REPLACE FUNCTION _kt_active_tasks_check_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('killed','completed') THEN
    RAISE EXCEPTION
      'kinetiks_active_tasks: status=% is terminal (attempted → %)', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (
    (OLD.status = 'active' AND NEW.status IN ('paused','killed','completed')) OR
    (OLD.status = 'paused' AND NEW.status IN ('active','killed','completed'))
  ) THEN
    RAISE EXCEPTION
      'kinetiks_active_tasks: illegal transition % → %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Stamp ended_at automatically on entry to a terminal state.
  IF NEW.status IN ('killed','completed') AND NEW.ended_at IS NULL THEN
    NEW.ended_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS active_tasks_lifecycle_guard ON kinetiks_active_tasks;
CREATE TRIGGER active_tasks_lifecycle_guard
  BEFORE UPDATE OF status ON kinetiks_active_tasks
  FOR EACH ROW
  EXECUTE FUNCTION _kt_active_tasks_check_transition();

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE kinetiks_active_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own active tasks"
  ON kinetiks_active_tasks
  FOR SELECT
  USING (account_id = (select public.kinetiks_account_id()));

-- ── Realtime ────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE kinetiks_active_tasks;
