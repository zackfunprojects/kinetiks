-- ============================================================
-- 00070_ledger_approval_marcus_event_types.sql
--
-- Audit remediation (Finding 1.4): the approval pipeline and the
-- Marcus engine write Ledger event types that are NOT in the
-- kinetiks_ledger_event_type_valid CHECK, so every one of those
-- inserts has been silently failing against the constraint since the
-- approval system shipped. The Learning Ledger — the input to
-- confidence scoring and the customer's audit trail — therefore has no
-- record of any approval being created, auto-approved, or approved
-- (only the negative half: rejections, expirations, flags).
--
-- Add the five missing event types so the positive approval signal and
-- the per-turn Marcus log actually land:
--
--   - approval_created           pipeline.ts (pending approval queued)
--   - approval_auto_approved     pipeline.ts (confidence cleared the bar)
--   - approval_approved          learning-loop.ts (user approved)
--   - approval_approved_with_edits  learning-loop.ts (approved + edits)
--   - marcus_turn                engine.ts (one conversational turn;
--                                replaces the phantom 'marcus_response_v2'
--                                that targeted a non-existent table)
--
-- CREATE WITH NOT VALID per the standing pattern (00042, 00044, 00047,
-- 00049, 00051, 00054, 00057, 00061, 00065); a future Phase-4.5-style
-- VALIDATE pass closes the accumulated debt once stable.
--
-- The drop + recreate re-lists every event type from 00065 verbatim
-- plus the five new entries — this is the canonical at-rest
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
    'connection_sync_failed'
  )) NOT VALID;
