-- ============================================================
-- 00065_connection_ledger_event_types.sql
--
-- Phase 7 — extend kinetiks_ledger_event_type_valid with four new
-- event types for the Nango Connect lifecycle:
--
--   - connection_created
--       Emitted by the auth webhook (handlers/auth.ts) when Nango
--       fires connection.created. Detail: provider, account_id,
--       nango_connection_id, nango_provider_config_key.
--
--   - connection_revoked
--       Emitted by the DELETE /api/connections/[id] route AND by the
--       auth webhook on connection.deleted. Detail: provider,
--       revocation_reason ('customer_revoked' | 'auth_expired' |
--       'provider_revoked').
--
--   - connection_sync_completed
--       Emitted alongside the existing kinetiks_sync_logs row when a
--       sync handler succeeds. Detail: provider, sync_name,
--       records_added, records_updated, records_deleted, duration_ms.
--       The Ledger mirror gives Marcus a unified history view that
--       composes with the rest of the trust architecture.
--
--   - connection_sync_failed
--       Same as above but for failed syncs. Detail carries
--       error_class + a PII-safe error_message. The application-side
--       reader filters to severity-relevant cases for Marcus surfacing.
--
-- CREATE WITH NOT VALID per the standing pattern (00042, 00044,
-- 00047, 00049, 00051, 00054, 00057, 00061); a future Phase-4.5-style
-- VALIDATE pass closes the debt.
--
-- The drop + recreate re-lists every existing event type from 00061
-- verbatim plus the four new entries — this is the canonical at-rest
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
