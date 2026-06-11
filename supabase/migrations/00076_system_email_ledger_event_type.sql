-- ============================================================
-- 00076_system_email_ledger_event_type.sql  (Phase D2)
--
-- Extend kinetiks_ledger_event_type_valid with one new event type:
--
--   - system_email_sent
--       Emitted by lib/email/sender.ts on every outbound email the
--       named system identity sends (briefs, alerts, summaries).
--       Detail: kind ('brief' | 'alert' | 'summary'), provider
--       ('gmail' | 'resend'), recipient_count, subject_length,
--       body_length. NO addresses and NO content (PII rules). These
--       rows are also the counter behind the spec's 20-sends/24h cap
--       (comms spec 2.4), so the writer treats a failed insert as an
--       error rather than a silent miss.
--
-- CREATE WITH NOT VALID per the standing pattern (00042, 00044,
-- 00047, 00049, 00051, 00054, 00057, 00061, 00065, 00070); a future
-- Phase-4.5-style VALIDATE pass closes the debt.
--
-- The drop + recreate re-lists every existing event type from 00070
-- verbatim plus the new entry - this is the canonical at-rest
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
    'connection_sync_failed',
    -- Phase D2: outbound email as the system identity
    'system_email_sent'
  )) NOT VALID;
