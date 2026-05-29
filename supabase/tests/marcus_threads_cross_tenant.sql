-- ============================================================
-- Cross-tenant isolation: kinetiks_marcus_threads
--
-- Read isolation: a user sees only their own chat threads.
-- Carries user SELECT/UPDATE/DELETE policies scoped to the owner
-- account; write-deny negatives land in Phase 4.
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-thread');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-thread');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_marcus_threads (account_id, title)
  VALUES (alice_account, 'alice thread'),
         (bob_account,   'bob thread');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_marcus_threads),
  1,
  'marcus_threads: alice sees exactly her own thread, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_marcus_threads),
  current_setting('test.alice_account'),
  'marcus_threads: the only visible thread belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
