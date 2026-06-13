-- ============================================================
-- 00079_billing_checkout.sql  (Phase E1 — billing acquisition)
--
-- 1. kinetiks_billing grows `stripe_subscription_id` — the live
--    subscription backing a paid plan (null on free). Written only by
--    the webhook sync (service role); the existing RLS posture
--    (user read-own, service-role writes) is unchanged.
--
-- 2. Uniqueness for the Stripe linkage. One Stripe customer maps to
--    exactly one account (the webhook resolves account by
--    stripe_customer_id — a duplicate mapping would route one
--    customer's events to two tenants). Same for the subscription id.
--    Partial indexes: free accounts carry NULLs.
--
-- 3. kinetiks_inbound_events.source gains 'stripe' — the webhook
--    claims event ids through the same exactly-once mechanism D3/D4
--    built for Slack/Gmail/Calendar (event_key 'stripe:<event_id>',
--    purged after 7 days by ratelimit-cleanup, far beyond Stripe's
--    72h retry horizon).
--
-- 4. kinetiks_ledger_event_type_valid re-listed with four new
--    subscription-lifecycle event types written by the webhook:
--      billing_subscription_started, billing_plan_changed,
--      billing_subscription_canceled, billing_payment_failed.
--    CREATE WITH NOT VALID per the standing pattern (00042..00076);
--    a future VALIDATE pass closes the debt.
-- ============================================================

-- 1. Subscription linkage.
ALTER TABLE kinetiks_billing
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- 2. One account per Stripe customer / subscription.
CREATE UNIQUE INDEX IF NOT EXISTS idx_kinetiks_billing_stripe_customer
  ON kinetiks_billing (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kinetiks_billing_stripe_subscription
  ON kinetiks_billing (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- 3. Stripe joins the inbound-event claim sources.
ALTER TABLE kinetiks_inbound_events
  DROP CONSTRAINT IF EXISTS kinetiks_inbound_events_source_check;

ALTER TABLE kinetiks_inbound_events
  ADD CONSTRAINT kinetiks_inbound_events_source_check
  CHECK (source IN ('slack', 'gmail', 'calendar', 'stripe'));

-- 4. Ledger event types — full re-list (00076 set + four billing types).
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
    'billing_payment_failed'
  )) NOT VALID;
