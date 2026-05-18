-- ============================================================
-- 00042_kinetiks_ledger_event_type_check.sql
--
-- L1b: tighten kinetiks_ledger.event_type via a CHECK constraint
-- mirroring the LedgerEventType union in @kinetiks/types/billing.ts
-- (now keyed off LedgerEventDetailMap).
--
-- The constraint matches the audited set of strings currently written
-- by code:
--   - Cortex evaluation pipeline (proposal_*, routing_sent, user_edit)
--   - Archivist (clean, dedup, normalize, quality_score, gap_detect,
--     cron_run)
--   - Other crons (cortex_cron_run, expire_cron_run)
--   - Generic (expiration, import)
--   - Account lifecycle (account_created, app_activation)
--   - Approval lifecycle (approval_*)
--   - Marcus (marcus_*, command_executed)
--   - Cartographer (cartographer_analyze)
--   - Insights (insight_applied)
--   - Synapse (synapse_pull)
--   - Sentinel (sentinel_review, sentinel_override)
--   - Pattern Library (pattern_*)
--
-- Adding a new event type going forward requires:
--   1. Add a key to LedgerEventDetailMap in @kinetiks/types
--   2. Migration extending the CHECK constraint (drop + recreate the
--      constraint with the new value added)
--
-- The constraint matches the union exactly so the DB and the TS layer
-- catch the same divergence.
-- ============================================================

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
    'pattern_archived'
  ));

COMMENT ON COLUMN kinetiks_ledger.event_type IS
  'LedgerEventType per @kinetiks/types/billing.ts. CHECK constraint enforces the union; adding a new event type requires updating both the TS LedgerEventDetailMap and dropping+recreating this constraint with the new value.';
