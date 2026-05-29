-- ============================================================
-- Cross-tenant isolation: kinetiks_goals
--
-- Read isolation: a user sees only their own goals. Policy is
-- FOR ALL scoped to the owner account; this suite proves the read
-- boundary the Phase 3 cutover relies on.
-- ============================================================

BEGIN;
SELECT plan(2);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user   uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'cf-goal');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-goal');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_goals (account_id, name, type)
  VALUES (alice_account, 'alice goal', 'kpi_target'),
         (bob_account,   'bob goal',   'kpi_target');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_goals),
  1,
  'goals: alice sees exactly her own goal, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_goals),
  current_setting('test.alice_account'),
  'goals: the only visible goal belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
