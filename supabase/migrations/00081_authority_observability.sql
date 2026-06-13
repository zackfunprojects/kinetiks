-- ============================================================
-- 00081_authority_observability.sql  (Phase E3)
--
-- 1. kinetiks_authority_grants joins the Realtime publication.
--    Grant status changes (granted, paused, narrowed, revoked,
--    expired) propagate to open client surfaces per the platform
--    contract; delivery is RLS-scoped (the table's "Users read own
--    authority grants" SELECT policy gates postgres_changes), and the
--    client additionally filters by account_id. Mirrors 00020's
--    kinetiks_approvals precedent.
--
-- 2. kinetiks_ledger_event_type_valid re-listed with one new type:
--
--      pattern_read_denied
--        Written by the pattern read path (lib/cortex/patterns/list.ts)
--        when an agent caller explicitly requests pattern types its
--        read_apps allowlist does not permit. Pre-E3 the denial was a
--        silent filter — enforcement without an audit trail. Detail:
--        caller_app + the denied type keys (registry identifiers,
--        never pattern content).
--
--    CREATE WITH NOT VALID per the standing pattern; the re-list is
--    the canonical at-rest constraint after this migration. It
--    includes the four Phase E1 billing types (introduced in 00079,
--    which merges ahead of this migration in the Phase E train).
-- ============================================================

-- 1. Realtime propagation of grant status.
ALTER PUBLICATION supabase_realtime ADD TABLE kinetiks_authority_grants;

-- 2. Ledger event types — full re-list (00079 set + pattern_read_denied).
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
    'pattern_read_denied'
  )) NOT VALID;
