-- ============================================================
-- 00037_oracle_schedule_dedup_runs.sql
--
-- D2 Slice 2: Oracle operational surface.
--
-- Changes:
--   1. kinetiks_insights gets a `dedup_key` column. The Oracle writer
--      consults this column within a 24h window to skip re-emitting the
--      same logical insight. The legacy `kinetiks_oracle_insights`
--      table's (account_id, insight_type, title) dedup is retired in
--      Slice 12; this index drives the new contract.
--   2. kinetiks_oracle_runs operational table — one row per
--      analyzeAccount() call, with counts + ai_call_id correlation and
--      error details. Read-own RLS for the Sources panel; service-role
--      writes from the Node runner.
--   3. oracle-analysis-cron schedule line (*/30) using the existing
--      _kt_schedule_edge_function() helper from migration 00035.
--
-- team_scope_id placeholder per the 2027 addendum.
-- ============================================================

-- ── 1. dedup_key on kinetiks_insights ─────────────────────────
ALTER TABLE kinetiks_insights
  ADD COLUMN IF NOT EXISTS dedup_key text;

COMMENT ON COLUMN kinetiks_insights.dedup_key IS
  'Writer-supplied stable key the Oracle uses for 24h dedup. For Oracle-emitted rows the format is {detector}:{metric}:{dim}:{dim_value}:{period_id}, with cross-source detectors including a sorted source list (e.g. roas-channel:meta:2026-W20). Null is allowed for non-Oracle writers (identity_update, approval_outcome, etc.).';

-- Partial index drives the writer's dedup lookup. We index by
-- (account_id, source_operator, dedup_key, created_at DESC) and apply the
-- 24h window app-side, since Postgres partial-index predicates can't
-- reference now().
CREATE INDEX IF NOT EXISTS idx_kinetiks_insights_dedup
  ON kinetiks_insights (account_id, source_operator, dedup_key, created_at DESC)
  WHERE dedup_key IS NOT NULL;

-- ── 2. kinetiks_oracle_runs ───────────────────────────────────
CREATE TABLE IF NOT EXISTS kinetiks_oracle_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  team_scope_id text,                                            -- v2 placeholder

  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,

  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'skipped', 'errored')),
  reason text,                                                   -- e.g. 'no_active_connection', 'no_recent_cache', 'eligibility_failed'

  -- Counts
  signals_total integer NOT NULL DEFAULT 0,
  signals_by_type jsonb NOT NULL DEFAULT '{}'::jsonb,            -- { anomaly: 3, trend: 1, drill: 2, correlation: 0, ... }
  insights_written integer NOT NULL DEFAULT 0,
  insights_deduped integer NOT NULL DEFAULT 0,
  proposals_emitted integer NOT NULL DEFAULT 0,

  -- Source coverage (which integrations contributed to this run)
  sources_evaluated text[] NOT NULL DEFAULT '{}'::text[],        -- ['ga4', 'gsc', 'hubspot']

  -- Cost correlation
  haiku_tokens_in integer,
  haiku_tokens_out integer,
  ai_call_id uuid,                                               -- correlation to kinetiks_ai_calls

  -- Failure details (when status='errored'). Ids only, no PII.
  error_class text,
  error_message text,

  source_operator text NOT NULL DEFAULT 'oracle.analyzer',       -- parity with kinetiks_insights.source_operator

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kinetiks_oracle_runs_account_started
  ON kinetiks_oracle_runs (account_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_kinetiks_oracle_runs_status_started
  ON kinetiks_oracle_runs (status, started_at DESC)
  WHERE status <> 'succeeded';

ALTER TABLE kinetiks_oracle_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own oracle_runs" ON kinetiks_oracle_runs;
CREATE POLICY "Users read own oracle_runs"
  ON kinetiks_oracle_runs
  FOR SELECT
  USING (
    account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())
  );

-- No client INSERT/UPDATE/DELETE policy. Default-deny.

COMMENT ON TABLE kinetiks_oracle_runs IS
  'One row per analyzeAccount() invocation. Read-own RLS, service-role writes from the Node runner. Provides the operational data shown in the Analytics SourcesPanel ("Last Oracle run") and the inputs to the cost-alert helper. team_scope_id is v2 placeholder.';

-- ── 3. Schedule oracle-analysis-cron ──────────────────────────
-- The actual cron.schedule() call lives in
-- 00038_edge_function_schedules.sql so the functions-drift-check.sh
-- guardrail (which only inspects *_edge_function_schedules.sql files)
-- can find it. The split keeps this migration focused on the dedup +
-- oracle_runs schema work.
