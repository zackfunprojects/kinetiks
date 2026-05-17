-- ============================================================
-- 00032_ai_and_tool_calls.sql
-- Observability substrate for every AI call and every tool
-- invocation. One row per Anthropic call (retries are separate
-- rows). One row per tool execution. team_scope_id is the v2
-- multi-user placeholder, always null in v1.
--
-- These tables are the seam for:
--   - Cost monitoring + usage metering (billing)
--   - Per-tool latency observability
--   - Trust-contraction confidence learning loop
--   - Sentry / PostHog correlation (no PII)
-- ============================================================

-- ─── kinetiks_ai_calls ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS kinetiks_ai_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  team_scope_id text,                                       -- v2 placeholder
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Call identity
  task text NOT NULL,                                       -- e.g. 'marcus.pre_analysis', 'archivist.pattern_dedupe'
  model text NOT NULL,                                      -- 'claude-haiku-4-5-20251001', etc.
  prompt_version text,                                      -- pinned prompt version
  attempt_number integer NOT NULL DEFAULT 1,
  parent_call_id uuid REFERENCES kinetiks_ai_calls(id) ON DELETE SET NULL,

  -- Correlation (no PII; ids only)
  correlation_id text,
  thread_id uuid,
  agent_run_id uuid,
  proposal_id uuid,
  approval_id uuid,
  grant_id uuid,
  pattern_id uuid,
  tool_call_id uuid,

  -- Outcome
  status text NOT NULL CHECK (status IN ('success', 'error', 'rate_limited', 'configuration_error', 'timeout')),
  error_class text,                                         -- 'rate_limited' | 'configuration_error' | 'transient' | 'permanent'
  error_message text,                                       -- generic, never raw upstream message with PII

  -- Tokens + cost
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  cost_usd numeric(10, 6),

  -- Timing
  latency_ms integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  -- Typed metadata: primitives + string arrays only (never raw payloads, never prompt text)
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_kinetiks_ai_calls_account_started
  ON kinetiks_ai_calls (account_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_kinetiks_ai_calls_task_started
  ON kinetiks_ai_calls (task, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_kinetiks_ai_calls_correlation
  ON kinetiks_ai_calls (correlation_id);
CREATE INDEX IF NOT EXISTS idx_kinetiks_ai_calls_status
  ON kinetiks_ai_calls (status) WHERE status <> 'success';

-- RLS: a user sees AI calls only for accounts they own.
ALTER TABLE kinetiks_ai_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own ai_calls" ON kinetiks_ai_calls;
CREATE POLICY "Users read own ai_calls"
  ON kinetiks_ai_calls
  FOR SELECT
  USING (
    account_id IS NULL
    OR account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())
  );

-- Inserts only via service role (the @kinetiks/ai router).
-- No client INSERT/UPDATE/DELETE policy is declared, so default-deny applies.

-- ─── kinetiks_tool_calls ───────────────────────────────────
CREATE TABLE IF NOT EXISTS kinetiks_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  team_scope_id text,                                       -- v2 placeholder
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Tool identity
  tool_name text NOT NULL,                                  -- 'ga4_query', 'hv_send_email', etc.
  tool_version text,                                        -- registry tool version
  is_consequential boolean NOT NULL,
  action_class text,                                        -- registered action_class if consequential

  -- Caller identity
  invoked_by_agent text,                                    -- 'marcus' | 'oracle' | 'cartographer' | 'archivist' | 'authority_agent' | app-internal
  parent_ai_call_id uuid REFERENCES kinetiks_ai_calls(id) ON DELETE SET NULL,

  -- Idempotency
  idempotency_key text,                                     -- (account_id, tool_name, idempotency_key) UNIQUE

  -- Correlation
  correlation_id text,
  thread_id uuid,
  agent_run_id uuid,
  proposal_id uuid,
  approval_id uuid,
  grant_id uuid,                                            -- if action authorized under an Authority Grant
  pattern_id uuid,

  -- Outcome
  status text NOT NULL CHECK (status IN ('success', 'error', 'denied', 'queued_for_approval')),
  error_message text,                                       -- generic, never raw upstream

  -- Authority resolution outcome (per 2027 addendum §2.9)
  authority_outcome text CHECK (authority_outcome IN ('grant_covers', 'auto_threshold', 'queued', 'escalated', 'fallback', 'denied')),

  -- Timing
  latency_ms integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  -- Typed metadata: primitives + string arrays only (never raw payloads, never tool I/O containing PII)
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Idempotency uniqueness (per-account, per-tool)
CREATE UNIQUE INDEX IF NOT EXISTS idx_kinetiks_tool_calls_idempotency
  ON kinetiks_tool_calls (account_id, tool_name, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kinetiks_tool_calls_account_started
  ON kinetiks_tool_calls (account_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_kinetiks_tool_calls_tool_started
  ON kinetiks_tool_calls (tool_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_kinetiks_tool_calls_grant
  ON kinetiks_tool_calls (grant_id) WHERE grant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kinetiks_tool_calls_correlation
  ON kinetiks_tool_calls (correlation_id);
CREATE INDEX IF NOT EXISTS idx_kinetiks_tool_calls_status
  ON kinetiks_tool_calls (status) WHERE status <> 'success';

ALTER TABLE kinetiks_tool_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own tool_calls" ON kinetiks_tool_calls;
CREATE POLICY "Users read own tool_calls"
  ON kinetiks_tool_calls
  FOR SELECT
  USING (
    account_id IS NULL
    OR account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())
  );

-- Inserts only via service role (the Agent Runtime).
-- No client INSERT/UPDATE/DELETE policy is declared, so default-deny applies.

COMMENT ON TABLE kinetiks_ai_calls IS
  'One row per Anthropic API call. Retries are separate rows. Service-role insert only. team_scope_id is v2 placeholder.';
COMMENT ON TABLE kinetiks_tool_calls IS
  'One row per Agent Runtime tool execution. Service-role insert only. grant_id is attached when authorized under an Authority Grant. team_scope_id is v2 placeholder.';
