-- ============================================================
-- 00057_authority_default_ledger_event_types.sql
--
-- Phase 5 — Kinetiks Contract Addendum §2.6.
--
-- Three new Ledger event types for the default standing grants flow:
--
--   - authority_default_rejected
--       Customer un-checked a default at signup (no grant ever exists)
--       OR explicitly rejected a default in the manifest-diff approval
--       queue (in which case the standard authority_grant_revoked fires
--       too; this entry adds the default-flow provenance). Distinct
--       from authority_grant_revoked because the latter requires a
--       grant_id and a grant lifecycle; rejection at signup never
--       produces a grant. Detail carries default_origin_app and
--       default_origin_key for join-back.
--
--   - authority_default_skipped
--       Customer hit "Skip for now" at signup. The customer made a
--       decision (defer); the kinetiks_accounts.authority_defaults_
--       reviewed_at marker is set but no grant exists. The diff cron
--       treats this as a soft rejection and honors the 30-day
--       cooldown before re-proposing.
--
--   - authority_default_re_proposed
--       The manifest-diff cron re-proposed a default the customer had
--       previously rejected or skipped, after the 30-day cooldown
--       elapsed. Pairs with a standard authority_grant_proposed entry
--       (which carries the new grant_id) and adds the "this was a
--       re-propose, not a first proposal" signal for the Authority
--       Agent calibration loop. The matching grant_id surfaces on the
--       new entry; the prior_rejection_at carries the cooldown's
--       reference point so reviewers can see how long we waited.
--
-- CREATE WITH NOT VALID per the standing pattern (00042, 00044,
-- 00047, 00049, 00051, 00054); Phase 4.5 closes the audit + VALIDATE
-- pass that bundles every newly-added event type across phases.
--
-- The drop + recreate re-lists every existing event type from 00054
-- verbatim — this is the canonical at-rest representation of the
-- constraint after this migration applies.
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
    'authority_action_escalated',
    -- Phase 5: Default standing grants (signup + manifest-diff)
    'authority_default_rejected',
    'authority_default_skipped',
    'authority_default_re_proposed'
  )) NOT VALID;
