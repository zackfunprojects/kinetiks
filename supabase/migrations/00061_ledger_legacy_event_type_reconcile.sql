-- ============================================================
-- 00061_ledger_legacy_event_type_reconcile.sql
--
-- Phase 4.5 — reconciliation pass before VALIDATE.
--
-- The audit at `docs/operational/phase-4.5-audit-2026-05-27.md`
-- found two legacy `event_type` values in `kinetiks_ledger` that
-- predate the constraint's NOT VALID era:
--
--   cartographer_crawl     (3 rows, 2026-03-25)
--   cartographer_calibrate (4 rows, 2026-03-25)
--
-- Both are real Cartographer events with stable, self-describing
-- detail shapes. They are NOT typos and not synonyms of any current
-- canonical event_type (`cartographer_analyze` is a sibling, not a
-- substitute). Decision per the audit: preserve them by adding to
-- the CHECK union. No UPDATEs.
--
-- This migration extends the union with the two new types so that
-- `ALTER TABLE ... VALIDATE CONSTRAINT` in the follow-up migration
-- 00062 sees every existing row as conformant. Created `NOT VALID`
-- per the standing pattern (validation pays its cost in 00062).
--
-- The drop + recreate re-lists every existing event type from 00057
-- verbatim plus the two new entries — this is the canonical at-rest
-- representation of the constraint after this migration applies.
-- ============================================================

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
    'cartographer_crawl',         -- Phase 4.5 reconciliation: legacy
    'cartographer_calibrate',     -- Phase 4.5 reconciliation: legacy
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
    'authority_default_re_proposed'
  )) NOT VALID;
