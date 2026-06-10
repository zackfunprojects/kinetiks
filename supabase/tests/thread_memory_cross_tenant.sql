-- ============================================================
-- Cross-tenant isolation: kinetiks_thread_memory
--
-- Post-00072: account_id references kinetiks_accounts(id) and the policy
-- scopes by the standard account subquery. Rows are seeded with the
-- account id (not the user UUID) and the assertion compares against it.
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-mem');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-mem');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_thread_memory (account_id, thread_id, memory_type, content)
  VALUES (alice_account, gen_random_uuid(), 'fact', 'alice memory'),
         (bob_account,   gen_random_uuid(), 'fact', 'bob memory');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_thread_memory),
  1,
  'thread_memory: alice sees exactly her own memory, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_thread_memory),
  current_setting('test.alice_account'),
  'thread_memory: the only visible memory belongs to alice (scoped by account_id)'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
