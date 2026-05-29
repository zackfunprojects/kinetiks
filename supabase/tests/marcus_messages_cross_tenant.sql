-- ============================================================
-- Cross-tenant isolation: kinetiks_marcus_messages
--
-- Read isolation via the parent thread: messages have no
-- account_id; the RLS policy scopes through thread_id ->
-- kinetiks_marcus_threads.account_id. This proves a user sees only
-- the messages in their own threads. The visible row is identified
-- by its content marker.
-- ============================================================

BEGIN;
SELECT plan(2);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user   uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
  alice_thread uuid;
  bob_thread uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'cf-msg');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-msg');

  INSERT INTO kinetiks_marcus_threads (account_id, title)
  VALUES (alice_account, 'alice thread') RETURNING id INTO alice_thread;
  INSERT INTO kinetiks_marcus_threads (account_id, title)
  VALUES (bob_account, 'bob thread') RETURNING id INTO bob_thread;

  INSERT INTO kinetiks_marcus_messages (thread_id, role, content)
  VALUES (alice_thread, 'user', 'alice-msg'),
         (bob_thread,   'user', 'bob-msg');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_marcus_messages),
  1,
  'marcus_messages: alice sees exactly the message in her own thread, not bob''s'
);
SELECT is(
  (SELECT content FROM kinetiks_marcus_messages),
  'alice-msg',
  'marcus_messages: the only visible message is alice''s'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
