-- ============================================================
-- Cross-tenant isolation: kinetiks_active_tasks
--
-- No user can read or write another account's task-drawer rows.
-- Writes are service-role only (the command pipeline / task drawer
-- routes write under service role).
-- ============================================================

BEGIN;
SELECT plan(6);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-task');
  bob_account   := _kt_test_seed_account(bob_user,   'bright-otter-task');

  INSERT INTO kinetiks_active_tasks
    (id, account_id, thread_id, name, app_name, status)
  VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', alice_account, 'thr-a',
     'Build fintech CFO sequence', 'harvest', 'active'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', bob_account, 'thr-b',
     'Draft AI security blog post', 'dm', 'active');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT results_eq(
  $$ SELECT id FROM kinetiks_active_tasks ORDER BY id $$,
  $$ VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) $$,
  'alice sees only her own active task'
);

SELECT is_empty(
  $$ SELECT id FROM kinetiks_active_tasks WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid $$,
  'alice cannot read bob''s active task by id'
);

SELECT throws_ok(
  $$ INSERT INTO kinetiks_active_tasks (account_id, thread_id, name, app_name)
     VALUES
       ((SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111'),
        'thr-z', 'planted', 'harvest') $$,
  '42501', NULL,
  'alice cannot INSERT an active task (no INSERT policy for user tokens)'
);

SELECT lives_ok(
  $$ UPDATE kinetiks_active_tasks SET status = 'killed', ended_at = now() WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid $$,
  'alice''s update on bob''s task runs without throwing (RLS filters target rows)'
);

SELECT _kt_test_clear_auth();

SELECT is(
  (SELECT status FROM kinetiks_active_tasks WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid),
  'active',
  'bob''s task stays active after alice''s update attempt'
);

SELECT is(
  (SELECT count(*)::int FROM kinetiks_active_tasks WHERE thread_id = 'thr-z'),
  0,
  'no task was planted by alice''s INSERT attempt'
);

SELECT * FROM finish();
ROLLBACK;
