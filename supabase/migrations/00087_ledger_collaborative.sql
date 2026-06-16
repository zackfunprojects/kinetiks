-- ============================================================
-- 00087_ledger_collaborative.sql
--
-- Phase 8.0 — Collaborative Workspace platform substrate.
--
-- Two kinetiks_ledger changes for the collaborative workspace:
--
-- 1. team_scope_id placeholder column. Every table participating in the
--    2027 trust architecture carries `team_scope_id text` (null in v1,
--    schema-forward to v2). The Ledger was missing it while patterns,
--    authority grants, and ai_calls already carry it. Adding it now keeps
--    the convention complete for collaborative-workspace ledger writes
--    (kill signals, intervention signals) that follow.
--
-- 2. Three new ledger event types for the collaborative workspace:
--      - task_killed        the user killed an in-flight task (§8.3); a
--                           2x-weight negative signal vs a standard reject
--      - intervention_undo  the user undid a system action (§9.3); a weak
--                           rejection signal
--      - intervention_grab  the user grabbed a field the system was about
--                           to fill (§9.3); a field-level confidence penalty
--
-- Constraint extension follows the standing NOT VALID pattern (00065,
-- 00070): drop + recreate re-listing every event type from 00070 verbatim
-- plus the three new entries. A future Phase-4.5-style VALIDATE pass closes
-- the accumulated debt once stable.
-- ============================================================

-- ── 1. team_scope_id placeholder ────────────────────────────
ALTER TABLE kinetiks_ledger
  ADD COLUMN IF NOT EXISTS team_scope_id text;

COMMENT ON COLUMN kinetiks_ledger.team_scope_id IS
  'v2 multi-user placeholder. Always null in v1; queries treat null as the implicit single-user team. Never defaulted to anything else.';

-- ── 2. event_type constraint extension (NOT VALID) ──────────
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
    -- Phase 8.0: Collaborative Workspace
    'task_killed',
    'intervention_undo',
    'intervention_grab'
  )) NOT VALID;
