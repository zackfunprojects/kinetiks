-- ============================================================
-- Cross-tenant isolation: kinetiks_connections
--
-- Read isolation: a user sees only their own connections. This
-- table also carries user INSERT/UPDATE/DELETE policies; the
-- cross-tenant WRITE-deny assertions are added in Phase 4 with
-- the rest of the write-policy negative tests. Phase 1 proves
-- the read boundary the cutover depends on.
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-conn');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-conn');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_connections (account_id, provider)
  VALUES (alice_account, 'ga4'),
         (bob_account,   'ga4');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_connections),
  1,
  'connections: alice sees exactly her own connection, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_connections),
  current_setting('test.alice_account'),
  'connections: the only visible connection belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
