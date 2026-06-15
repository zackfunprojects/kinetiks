-- ============================================================
-- 00089_kinetiks_workspace_actions.sql
--
-- Phase 8.0 — Collaborative Workspace shared undo stack (spec §7.3).
--
-- Both agent and user actions on the shared surface live in one ordered
-- history so either participant can be undone independently. `sequence_index`
-- guarantees causal ordering within a thread (unique per account+thread);
-- `undone` marks an action as reverted without deleting it (the timeline in
-- spec §7.3 shows who did what, including undos).
--
-- RLS: account-scoped reads; service-role writes (the embed API routes write
-- under service role). Broadcast of live undo-stack changes rides the
-- `workspace:{account}:{thread}` channel; the persisted rows back the
-- timeline + redo.
-- ============================================================

CREATE TABLE kinetiks_workspace_actions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  thread_id      text NOT NULL,
  team_scope_id  text,                         -- v2 placeholder; null in v1

  participant    text NOT NULL CHECK (participant IN ('agent','user')),
  action_type    text NOT NULL
                 CHECK (action_type IN ('field_update','entity_create','entity_delete','reorder','configuration')),
  target         text NOT NULL,                -- component/field id
  previous_value jsonb,
  new_value      jsonb,
  annotation_id  uuid REFERENCES kinetiks_annotations(id) ON DELETE SET NULL,

  sequence_index integer NOT NULL,             -- causal order within the thread
  undone         boolean NOT NULL DEFAULT false,

  source_app     text NOT NULL DEFAULT 'kinetiks_fixtures',
  created_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (account_id, thread_id, sequence_index)
);

COMMENT ON TABLE kinetiks_workspace_actions IS
  'Collaborative-workspace shared undo stack (spec §7.3). Agent + user actions in one causally-ordered history (sequence_index unique per account+thread). undone flags a reverted action without deleting it. Service-role writes, account-scoped reads.';

CREATE INDEX idx_workspace_actions_thread
  ON kinetiks_workspace_actions (account_id, thread_id, sequence_index);

CREATE INDEX idx_workspace_actions_source_app
  ON kinetiks_workspace_actions (source_app);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE kinetiks_workspace_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own workspace actions"
  ON kinetiks_workspace_actions
  FOR SELECT
  USING (account_id = (select public.kinetiks_account_id()));

-- ── Realtime ────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE kinetiks_workspace_actions;
