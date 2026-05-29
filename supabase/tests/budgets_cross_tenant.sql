-- ============================================================
-- Cross-tenant isolation: kinetiks_budgets
--
-- Read isolation: a user sees only their own budgets. Policy is
-- FOR ALL scoped to the owner account.
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-bud');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-bud');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_budgets (account_id, total_budget, period_start, period_end)
  VALUES (alice_account, 1000, now(), now() + interval '30 days'),
         (bob_account,   2000, now(), now() + interval '30 days');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_budgets),
  1,
  'budgets: alice sees exactly her own budget, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_budgets),
  current_setting('test.alice_account'),
  'budgets: the only visible budget belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
