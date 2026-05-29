-- ============================================================
-- Cross-tenant isolation: kinetiks_oracle_insights
--
-- Read isolation: a user sees only their own Oracle insights.
-- Policy is FOR ALL scoped to the owner account.
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-oi');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-oi');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_oracle_insights (account_id, insight_type, title, body)
  VALUES (alice_account, 'trend', 'alice insight', 'body'),
         (bob_account,   'trend', 'bob insight',   'body');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_oracle_insights),
  1,
  'oracle_insights: alice sees exactly her own insight, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_oracle_insights),
  current_setting('test.alice_account'),
  'oracle_insights: the only visible insight belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
