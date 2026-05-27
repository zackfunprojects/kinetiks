-- ============================================================
-- 00049_workflow_task_ledger_event_types.sql
--
-- Phase 3: extend the `kinetiks_ledger_event_type_valid` CHECK
-- constraint (introduced 00042 NOT VALID, extended 00044 + 00047) to
-- include the three Operator Workflow event types written by the
-- workflow dispatcher in @kinetiks/runtime per the Kinetiks Contract
-- Addendum §3:
--
--   - `workflow_task_dispatched`  task entered dispatch path
--                                 (one per task per run)
--   - `workflow_task_completed`   task returned successfully
--                                 (one per successful task)
--   - `workflow_task_failed`      task threw or schema validation
--                                 failed (one per failed task; the
--                                 workflow halts on first failure)
--
-- The dispatcher writes correlation_id into detail on every event so
-- a single SQL filter reconstructs the full run trace. PII rules
-- match ai_calls / tool_calls: counts, ids, error classes only —
-- never raw task input/output payloads or prompt text.
--
-- Procedure: drop the existing constraint and recreate it with the
-- new values added. The recreated constraint is again marked
-- NOT VALID so historical rows continue to be grandfathered — Phase
-- 4.5 closes the audit + VALIDATE pass once Phases 1.5, 2, 3, and 4
-- have all landed.
--
-- Adding a new event type going forward requires:
--   1. Add a key to LedgerEventDetailMap in @kinetiks/types
--   2. Migration extending the CHECK constraint (drop + recreate)
--
-- The constraint matches the TS union exactly.
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
    'workflow_task_failed'
  )) NOT VALID;
