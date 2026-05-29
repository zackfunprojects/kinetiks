-- ============================================================
-- Cross-tenant isolation: kinetiks_goal_snapshots
--
-- Read isolation: a user sees only their own goal snapshots.
-- Each snapshot carries account_id directly (and FKs a goal),
-- policy FOR ALL scoped to the owner account.
-- ============================================================

BEGIN;
SELECT plan(2);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user   uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
  alice_goal uuid;
  bob_goal uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'cf-snap');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-snap');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_goals (account_id, name, type)
  VALUES (alice_account, 'alice goal', 'kpi_target') RETURNING id INTO alice_goal;
  INSERT INTO kinetiks_goals (account_id, name, type)
  VALUES (bob_account, 'bob goal', 'kpi_target') RETURNING id INTO bob_goal;

  INSERT INTO kinetiks_goal_snapshots (goal_id, account_id, value)
  VALUES (alice_goal, alice_account, 10),
         (bob_goal,   bob_account,   20);
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_goal_snapshots),
  1,
  'goal_snapshots: alice sees exactly her own snapshot, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_goal_snapshots),
  current_setting('test.alice_account'),
  'goal_snapshots: the only visible snapshot belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
