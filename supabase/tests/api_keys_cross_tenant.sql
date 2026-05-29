-- ============================================================
-- Cross-tenant isolation: kinetiks_api_keys
--
-- Read isolation: a user sees only their own API keys. Carries
-- user SELECT/INSERT/UPDATE/DELETE policies plus a service-role
-- catch-all; write-deny negatives land in Phase 4. Phase 1 proves
-- the read boundary.
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-key');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-key');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_api_keys (account_id, key_hash, key_prefix, name)
  VALUES (alice_account, 'hash-alice', 'kntk_a', 'alice key'),
         (bob_account,   'hash-bob',   'kntk_b', 'bob key');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_api_keys),
  1,
  'api_keys: alice sees exactly her own key, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_api_keys),
  current_setting('test.alice_account'),
  'api_keys: the only visible key belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
