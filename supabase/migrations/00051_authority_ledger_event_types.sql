-- ============================================================
-- 00051_authority_ledger_event_types.sql
--
-- Phase 4 — Kinetiks Contract Addendum §2.
--
-- Two changes:
--
--   1. Add `grant_id uuid` column to kinetiks_ledger (nullable,
--      indexed). Every authority-related Ledger entry carries it
--      so a SQL filter reconstructs the full grant audit trail. The
--      `detail->>'grant_id'` mirror remains for legacy readers, but
--      the column is the indexed source of truth.
--
--   2. Drop + recreate the `kinetiks_ledger_event_type_valid` CHECK
--      constraint to include the eight new authority event types
--      from packages/types/src/billing.ts. CREATE WITH NOT VALID per
--      the standing debt pattern (00042, 00044, 00047, 00049); Phase
--      4.5 closes the audit + VALIDATE pass.
--
-- New authority event types (matches LedgerEventDetailMap exactly):
--   - authority_grant_proposed
--   - authority_grant_approved
--   - authority_grant_paused
--   - authority_grant_narrowed
--   - authority_grant_revoked
--   - authority_grant_expired
--   - authority_action_taken
--   - authority_action_escalated
-- ============================================================

-- ── 1. grant_id column on kinetiks_ledger ───────────────────
-- ON DELETE RESTRICT preserves grant attribution in the audit trail.
-- CLAUDE.md treats the Ledger as append-only and forbids mutating
-- entries in place; nulling grant_id on grant delete would silently
-- break the trail. In practice grants are never hard-deleted (terminal
-- states are `revoked` and `expired`), so RESTRICT is a structural
-- guard, not an operational concern.
ALTER TABLE kinetiks_ledger
  ADD COLUMN IF NOT EXISTS grant_id uuid
    REFERENCES kinetiks_authority_grants(id) ON DELETE RESTRICT;

COMMENT ON COLUMN kinetiks_ledger.grant_id IS
  'Set on every Ledger entry produced under an active Authority Grant (authority_action_taken, authority_action_escalated, authority_grant_* lifecycle events). FK ON DELETE RESTRICT — grants must transition to revoked/expired (terminal states), never hard-deleted, so audit attribution is preserved. The detail jsonb may carry the same id as a redundant mirror; the column is the indexed source of truth.';

CREATE INDEX IF NOT EXISTS idx_ledger_grant_id
  ON kinetiks_ledger (grant_id, created_at DESC)
  WHERE grant_id IS NOT NULL;

-- Per-grant action_class read path used by the resolver's sub-day
-- pacing trigger and by the nightly usage_summary rollup.
CREATE INDEX IF NOT EXISTS idx_ledger_grant_event_created
  ON kinetiks_ledger (grant_id, event_type, created_at DESC)
  WHERE grant_id IS NOT NULL;

-- ── 2. Extend kinetiks_ledger_event_type_valid ─────────────
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
    'approval_batch_approved',
    'approval_expired',
    'approval_flagged',
    'approval_rejected',
    -- Marcus
    'marcus_daily_brief',
    'marcus_weekly_digest',
    'marcus_monthly_review',
    'command_executed',
    -- Cartographer
    'cartographer_analyze',
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
    'authority_grant_narrowed',
    'authority_grant_revoked',
    'authority_grant_expired',
    -- Phase 4: Authority Grants (per-action)
    'authority_action_taken',
    'authority_action_escalated'
  )) NOT VALID;
