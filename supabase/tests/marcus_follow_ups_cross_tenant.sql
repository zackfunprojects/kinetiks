-- ============================================================
-- Cross-tenant isolation: kinetiks_marcus_follow_ups
--
-- Account-scoped read boundary. A user sees only their own follow-ups.
-- Subquery-fallback path (no account_id claim set).
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-fup');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-fup');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_marcus_follow_ups (account_id, message, scheduled_for)
  VALUES (alice_account, 'alice follow-up', now()),
         (bob_account,   'bob follow-up',   now());
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_marcus_follow_ups),
  1,
  'marcus_follow_ups: alice sees exactly her own follow-up, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_marcus_follow_ups),
  current_setting('test.alice_account'),
  'marcus_follow_ups: the only visible follow-up belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
