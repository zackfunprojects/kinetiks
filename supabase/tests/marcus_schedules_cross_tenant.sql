-- ============================================================
-- Cross-tenant isolation: kinetiks_marcus_schedules
--
-- Account-scoped read boundary. A user sees only their own brief schedules.
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-sched');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-sched');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_marcus_schedules (account_id, type, schedule)
  VALUES (alice_account, 'daily_brief', '0 9 * * *'),
         (bob_account,   'daily_brief', '0 9 * * *');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_marcus_schedules),
  1,
  'marcus_schedules: alice sees exactly her own schedule, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_marcus_schedules),
  current_setting('test.alice_account'),
  'marcus_schedules: the only visible schedule belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
