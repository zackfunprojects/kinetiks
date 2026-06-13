-- ============================================================
-- 00082_model_assignments.sql  (Adaptive model selection — Slices 2-3)
--
-- The platform's live role → model-id mapping, plus the discovery/flip
-- bookkeeping behind the detect → propose → approve loop.
--
-- 1. kinetiks_model_assignments — the active role→model mapping the AI
--    router resolves through (@kinetiks/ai resolveModel). PLATFORM-LEVEL:
--    no account_id — model choice is one deployment-wide engineering
--    decision, not per-customer. One row per role. Seeded to mirror
--    @kinetiks/ai SEED_MODELS (the resolver falls back to those exact
--    ids if a row is ever missing, so they must agree). Service-role
--    plumbing: RLS enabled with NO user policies (default deny —
--    documented, like kinetiks_daily_counters / kinetiks_inbound_events).
--    Not part of the 2027 trust architecture, so no team_scope_id.
--
-- 2. kinetiks_model_flip_proposals — discovery's record of each proposed
--    flip (role, from→to). Drives idempotency (one open proposal per
--    (role,to_model)) and the rejection cooldown (don't re-propose a
--    model the operator declined within the window). The operator-facing
--    review is a kinetiks_approvals row (preview type 'model_flip');
--    approval_id is the soft link. Also platform-level + service-role.
--
-- 3. Ledger event types: model_flip_proposed / _approved / _rejected.
--
-- 4. Schedule model-discovery-cron (daily 08:00 UTC).
-- ============================================================

-- 1. Active assignment mapping.
CREATE TABLE kinetiks_model_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL UNIQUE CHECK (role IN ('fast', 'balanced', 'deep')),
  assigned_model_id text NOT NULL,
  family text NOT NULL CHECK (family IN ('haiku', 'sonnet', 'opus')),
  -- Provenance: how this assignment was set, and (for an approved flip)
  -- the operator who approved it + the model's release date.
  source text NOT NULL DEFAULT 'seed' CHECK (source IN ('seed', 'discovery_approved')),
  approved_by uuid REFERENCES kinetiks_accounts(id),
  released_at timestamptz,
  -- Operator kill switch: freeze a role so discovery never proposes a
  -- flip for it (e.g. while validating a model regression).
  frozen boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kinetiks_model_assignments ENABLE ROW LEVEL SECURITY;
-- Deliberately NO user policies: platform config, service-role only.

-- Seed one row per role — MUST match @kinetiks/ai SEED_MODELS, the
-- resolver's fallback when a row is absent.
INSERT INTO kinetiks_model_assignments (role, assigned_model_id, family, source)
VALUES
  ('fast',     'claude-haiku-4-5-20251001', 'haiku',  'seed'),
  ('balanced', 'claude-sonnet-4-6',         'sonnet', 'seed'),
  ('deep',     'claude-opus-4-8',           'opus',   'seed');

-- 2. Flip proposals (discovery bookkeeping + cooldown).
CREATE TABLE kinetiks_model_flip_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('fast', 'balanced', 'deep')),
  from_model text NOT NULL,
  to_model text NOT NULL,
  family text NOT NULL CHECK (family IN ('haiku', 'sonnet', 'opus')),
  -- The candidate model's release date (from the Models API), surfaced
  -- in the proposal so the operator sees how new it is.
  released_at timestamptz,
  -- Estimated monthly cost delta in USD (recent role volume × price
  -- delta); null when pricing is unknown — the proposal says so rather
  -- than fabricating a number.
  est_cost_delta_usd numeric,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  -- Soft link to the operator-facing kinetiks_approvals row (no FK:
  -- distinct lifecycles, and approvals may be pruned independently).
  approval_id uuid,
  reject_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

ALTER TABLE kinetiks_model_flip_proposals ENABLE ROW LEVEL SECURITY;
-- Deliberately NO user policies: platform config, service-role only.

-- One OPEN proposal per (role, to_model): the partial unique index makes
-- a concurrent duplicate discovery insert lose with 23505 (skip), so the
-- operator never sees the same flip twice.
CREATE UNIQUE INDEX idx_model_flip_proposals_open
  ON kinetiks_model_flip_proposals (role, to_model)
  WHERE status = 'pending';

-- Cooldown lookups: "did the operator reject this (role,to_model) recently?"
CREATE INDEX idx_model_flip_proposals_decided
  ON kinetiks_model_flip_proposals (role, to_model, status, decided_at DESC);

-- 3. Ledger event types — extend the CHECK (DROP + ADD NOT VALID per the
-- standing add-pattern; re-lists the full set from 00081 verbatim plus
-- the three model-flip events, which is the at-rest representation after
-- this migration applies).
ALTER TABLE kinetiks_ledger
  DROP CONSTRAINT IF EXISTS kinetiks_ledger_event_type_valid;

ALTER TABLE kinetiks_ledger
  ADD CONSTRAINT kinetiks_ledger_event_type_valid
  CHECK (event_type IN (
    -- Cortex evaluation
    'proposal_accepted',
    'proposal_declined',
    'routing_sent',
    'user_edit',
    -- Archivist
    'archivist_clean',
    'archivist_dedup',
    'archivist_normalize',
    'archivist_quality_score',
    'archivist_gap_detect',
    'archivist_cron_run',
    -- Other crons
    'cortex_cron_run',
    'expire_cron_run',
    -- Generic
    'expiration',
    'import',
    -- Account lifecycle
    'account_created',
    'app_activation',
    -- Approval lifecycle
    'approval_created',
    'approval_auto_approved',
    'approval_approved',
    'approval_approved_with_edits',
    'approval_batch_approved',
    'approval_expired',
    'approval_flagged',
    'approval_rejected',
    -- Marcus
    'marcus_turn',
    'marcus_daily_brief',
    'marcus_weekly_digest',
    'marcus_monthly_review',
    'command_executed',
    -- Cartographer
    'cartographer_analyze',
    'cartographer_crawl',
    'cartographer_calibrate',
    -- Insights
    'insight_applied',
    -- Synapse
    'synapse_pull',
    -- Sentinel
    'sentinel_review',
    'sentinel_override',
    -- Pattern Library
    'pattern_observed',
    'pattern_arbitrated',
    'pattern_user_starred',
    'pattern_user_unstarred',
    'pattern_user_suppressed',
    'pattern_user_unsuppressed',
    'pattern_user_annotated',
    'pattern_exported',
    'pattern_imported',
    'pattern_archived',
    -- Phase 1.5 fixtures
    'fixture_emission',
    'fixture_cleanup',
    -- Phase 2: empirical decay calibration
    'pattern_decay_calibrated',
    -- Phase 3: Operator Workflows dispatcher
    'workflow_task_dispatched',
    'workflow_task_completed',
    'workflow_task_failed',
    -- Phase 4: Authority Grants (lifecycle)
    'authority_grant_proposed',
    'authority_grant_approved',
    'authority_grant_paused',
    'authority_grant_resumed',
    'authority_grant_narrowed',
    'authority_grant_revoked',
    'authority_grant_expired',
    -- Phase 4: Authority Grants (per-action)
    'authority_action_taken',
    'authority_action_escalated',
    -- Phase 5: Default standing grants (signup + manifest-diff)
    'authority_default_rejected',
    'authority_default_skipped',
    'authority_default_re_proposed',
    -- Phase 7: Connection lifecycle (Nango Connect end-to-end)
    'connection_created',
    'connection_revoked',
    'connection_sync_completed',
    'connection_sync_failed',
    -- Phase D2: outbound email as the system identity
    'system_email_sent',
    -- Phase E1: subscription lifecycle (Stripe webhook)
    'billing_subscription_started',
    'billing_plan_changed',
    'billing_subscription_canceled',
    'billing_payment_failed',
    -- Phase E3: pattern read allowlist denials
    'pattern_read_denied',
    -- Adaptive model selection: detect → propose → approve flip
    'model_flip_proposed',
    'model_flip_approved',
    'model_flip_rejected'
  )) NOT VALID;

-- 4. Schedule the discovery cron. The _kt_schedule_edge_function helper
-- is upsert-by-name; the full active set is re-listed per the
-- functions-drift-check contract (it compares this at-rest list against
-- the deployed schedule set).
select _kt_schedule_edge_function('archivist-cron',         '0 */6 * * *', 'archivist-cron');
select _kt_schedule_edge_function('cortex-cron',            '* * * * *',   'cortex-cron');
select _kt_schedule_edge_function('expire-cron',            '0 * * * *',   'expire-cron');
select _kt_schedule_edge_function('gmail-sync-cron',        '*/5 * * * *', 'gmail-sync-cron');
select _kt_schedule_edge_function('marcus-daily',           '*/15 * * * *','marcus-daily');
select _kt_schedule_edge_function('marcus-followup',        '*/5 * * * *', 'marcus-followup');
select _kt_schedule_edge_function('marcus-monthly',         '*/15 * * * *','marcus-monthly');
select _kt_schedule_edge_function('marcus-weekly',          '*/15 * * * *','marcus-weekly');
select _kt_schedule_edge_function('ratelimit-cleanup',      '0 3 * * *',   'ratelimit-cleanup');
select _kt_schedule_edge_function('sequence-cron',          '* * * * *',   'sequence-cron');
select _kt_schedule_edge_function('webhook-retry',          '*/5 * * * *', 'webhook-retry');
select _kt_schedule_edge_function('oracle-analysis-cron',   '*/30 * * * *','oracle-analysis-cron');
select _kt_schedule_edge_function('fixture-emitter-cron',   '0 */2 * * *', 'fixture-emitter-cron');
select _kt_schedule_edge_function('authority-defaults-diff-cron', '0 7 * * *', 'authority-defaults-diff-cron');
select _kt_schedule_edge_function('email-poll',             '*/5 * * * *', 'email-poll');
select _kt_schedule_edge_function('meeting-prep',           '*/15 * * * *','meeting-prep');
-- Adaptive model selection: poll the Anthropic Models API once a day.
select _kt_schedule_edge_function('model-discovery-cron',   '0 8 * * *',   'model-discovery-cron');
