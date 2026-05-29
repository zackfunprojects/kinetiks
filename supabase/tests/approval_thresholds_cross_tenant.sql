-- ============================================================
-- Cross-tenant isolation: kinetiks_approval_thresholds
--
-- Read isolation: a user sees only their own per-category
-- thresholds. UNIQUE(account_id, action_category); service role
-- writes, users hold SELECT only.
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-thr');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-thr');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_approval_thresholds (account_id, action_category)
  VALUES (alice_account, 'outreach'),
         (bob_account,   'outreach');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_approval_thresholds),
  1,
  'approval_thresholds: alice sees exactly her own threshold, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_approval_thresholds),
  current_setting('test.alice_account'),
  'approval_thresholds: the only visible threshold belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
