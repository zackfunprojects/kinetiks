-- ============================================================
-- Cross-tenant isolation: kinetiks_thread_memory
--
-- NOTE: this table's account_id references auth.users(id) (the
-- user id), not kinetiks_accounts.id, and its policy is
-- `auth.uid() = account_id`. So rows are seeded with the user
-- UUID and the assertion compares against the user UUID.
-- ============================================================

BEGIN;
SELECT plan(2);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user   uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
  -- Seed accounts (also creates the auth.users rows the FK needs).
  PERFORM _kt_test_seed_account(alice_user, 'cf-mem');
  PERFORM _kt_test_seed_account(bob_user,   'bo-mem');
  PERFORM set_config('test.alice_user', alice_user::text, true);

  INSERT INTO kinetiks_thread_memory (account_id, thread_id, memory_type, content)
  VALUES (alice_user, gen_random_uuid(), 'fact', 'alice memory'),
         (bob_user,   gen_random_uuid(), 'fact', 'bob memory');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_thread_memory),
  1,
  'thread_memory: alice sees exactly her own memory, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_thread_memory),
  current_setting('test.alice_user'),
  'thread_memory: the only visible memory belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
