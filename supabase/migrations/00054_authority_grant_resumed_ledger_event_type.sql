-- ============================================================
-- 00054_authority_grant_resumed_ledger_event_type.sql
--
-- Phase 4 — Chunk 9.
--
-- Adds `authority_grant_resumed` to kinetiks_ledger_event_type_valid.
--
-- The state machine on kinetiks_authority_grants supports `paused →
-- active` (defined in migration 00050's _kt_authority_grants_check_
-- transition trigger) so the customer can lift a pause without revoking
-- the grant. Chunk 5-7 shipped only six of the eight lifecycle event
-- types the addendum's LedgerEventDetailMap declares — pause has an
-- explicit event, resume did not. That left an audit gap: a query
-- against kinetiks_ledger could not answer "when did the customer
-- resume this grant?" because no event recorded the transition.
--
-- This migration closes the gap by adding the dedicated event type,
-- following the same drop-and-recreate-NOT-VALID pattern as Phases
-- 1.5, 2, and the rest of Phase 4 (00042, 00044, 00047, 00049, 00051).
-- Phase 4.5 will VALIDATE the whole CHECK in one audit pass.
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
    'authority_action_escalated'
  )) NOT VALID;
