-- ============================================================
-- Cross-tenant isolation: kinetiks_imports
--
-- Read isolation: a user sees only their own imports. Carries
-- user SELECT + INSERT policies; write-deny negatives land in
-- Phase 4. Phase 1 proves the read boundary.
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-imports');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-imports');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_imports (account_id, import_type)
  VALUES (alice_account, 'csv'),
         (bob_account,   'csv');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_imports),
  1,
  'imports: alice sees exactly her own import, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_imports),
  current_setting('test.alice_account'),
  'imports: the only visible import belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
