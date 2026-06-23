-- ============================================================
-- Collaborative table constraints: kill reason, jsonb shapes, FK cascade
--
-- Closes the gaps left by the cross-tenant suites: the kill_reason_code CHECK
-- on kinetiks_active_tasks (§8.3), the jsonb-array CHECKs on
-- kinetiks_annotations (replies / evidence_refs), and the
-- kinetiks_workspace_actions.annotation_id FK ON DELETE SET NULL behavior
-- (an undo action must survive its annotation being deleted).
--
-- Runs as postgres: exercises constraints + FK actions, not RLS.
-- ============================================================

BEGIN;
SELECT plan(5);

DO $$
DECLARE
  u uuid := '55555555-5555-5555-5555-555555555555';
  acct uuid;
BEGIN
  acct := _kt_test_seed_account(u, 'amber-stoat-cons');

  -- A live annotation that a workspace action will reference.
  INSERT INTO kinetiks_annotations
    (id, account_id, thread_id, kind, component_id, field_name, summary, body)
  VALUES
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', acct, 'thr-c',
     'decision_note', 'subject', 'subject_line', 'Chose directness', 'Body text');

  -- A workspace action linked to that annotation.
  INSERT INTO kinetiks_workspace_actions
    (id, account_id, thread_id, participant, action_type, target, annotation_id, sequence_index)
  VALUES
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', acct, 'thr-c',
     'agent', 'field_update', 'subject_line',
     'cccccccc-cccc-cccc-cccc-cccccccccccc', 0);
END $$;

-- ── kill_reason_code CHECK (§8.3) ───────────────────────────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_active_tasks (account_id, thread_id, name, app_name, kill_reason_code)
     VALUES ((SELECT id FROM kinetiks_accounts WHERE codename = 'amber-stoat-cons'),
             'thr-k', 'Task', 'harvest', 'definitely_not_a_reason') $$,
  '23514', NULL,
  'an out-of-vocabulary kill_reason_code is rejected'
);

-- ── annotations jsonb-array CHECKs ──────────────────────────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_annotations
       (account_id, thread_id, kind, component_id, field_name, summary, body, replies)
     VALUES ((SELECT id FROM kinetiks_accounts WHERE codename = 'amber-stoat-cons'),
             'thr-c', 'suggestion', 'c', 'f', 's', 'b', '{"not":"an array"}'::jsonb) $$,
  '23514', NULL,
  'a non-array replies payload is rejected (jsonb_typeof CHECK)'
);
SELECT throws_ok(
  $$ INSERT INTO kinetiks_annotations
       (account_id, thread_id, kind, component_id, field_name, summary, body, evidence_refs)
     VALUES ((SELECT id FROM kinetiks_accounts WHERE codename = 'amber-stoat-cons'),
             'thr-c', 'suggestion', 'c', 'f', 's', 'b', '42'::jsonb) $$,
  '23514', NULL,
  'a non-array evidence_refs payload is rejected (jsonb_typeof CHECK)'
);

-- ── FK ON DELETE SET NULL (undo action survives annotation delete) ──
DELETE FROM kinetiks_annotations WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

SELECT is(
  (SELECT annotation_id FROM kinetiks_workspace_actions
     WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  NULL,
  'deleting an annotation nulls the workspace action''s annotation_id (ON DELETE SET NULL)'
);
SELECT is(
  (SELECT count(*)::int FROM kinetiks_workspace_actions
     WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  1,
  'the workspace action itself survives the annotation delete'
);

SELECT * FROM finish();
ROLLBACK;
