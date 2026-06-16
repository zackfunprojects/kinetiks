-- ============================================================
-- Cross-tenant isolation: kinetiks_workspace_actions
--
-- No user can read or write another account's shared-undo-stack rows.
-- Writes are service-role only. Also verifies the per-thread
-- sequence_index uniqueness that backs causal undo ordering.
-- ============================================================

BEGIN;
SELECT plan(7);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-wsa');
  bob_account   := _kt_test_seed_account(bob_user,   'bright-otter-wsa');

  INSERT INTO kinetiks_workspace_actions
    (id, account_id, thread_id, participant, action_type, target, new_value, sequence_index)
  VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', alice_account, 'thr-a',
     'agent', 'field_update', 'subject_line', '"new subject"'::jsonb, 0),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', bob_account, 'thr-b',
     'user', 'reorder', 'step_2', '{"to":1}'::jsonb, 0);
END $$;

-- ── alice sees only her own action ──────────────────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT results_eq(
  $$ SELECT id FROM kinetiks_workspace_actions ORDER BY id $$,
  $$ VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) $$,
  'alice sees only her own workspace action'
);

SELECT is_empty(
  $$ SELECT id FROM kinetiks_workspace_actions WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid $$,
  'alice cannot read bob''s workspace action by id'
);

SELECT throws_ok(
  $$ INSERT INTO kinetiks_workspace_actions
       (account_id, thread_id, participant, action_type, target, sequence_index)
     VALUES
       ((SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111'),
        'thr-a', 'user', 'field_update', 'x', 5) $$,
  '42501', NULL,
  'alice cannot INSERT a workspace action (no INSERT policy for user tokens)'
);

SELECT lives_ok(
  $$ UPDATE kinetiks_workspace_actions SET undone = true WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid $$,
  'alice''s update on bob''s action runs without throwing (RLS filters target rows)'
);

SELECT _kt_test_clear_auth();

SELECT is(
  (SELECT undone FROM kinetiks_workspace_actions WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid),
  false,
  'bob''s action stays not-undone after alice''s update attempt'
);

-- ── sequence_index is unique per (account, thread) ──────────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_workspace_actions
       (account_id, thread_id, participant, action_type, target, sequence_index)
     VALUES
       ((SELECT id FROM kinetiks_accounts WHERE codename = 'copper-fox-wsa'),
        'thr-a', 'user', 'field_update', 'dup', 0) $$,
  '23505', NULL,
  'duplicate sequence_index within a thread is rejected (causal ordering invariant)'
);

-- ── same sequence_index in a different thread is fine ───────
SELECT lives_ok(
  $$ INSERT INTO kinetiks_workspace_actions
       (account_id, thread_id, participant, action_type, target, sequence_index)
     VALUES
       ((SELECT id FROM kinetiks_accounts WHERE codename = 'copper-fox-wsa'),
        'thr-other', 'user', 'field_update', 'ok', 0) $$,
  'sequence_index 0 is allowed again in a different thread'
);

SELECT * FROM finish();
ROLLBACK;
