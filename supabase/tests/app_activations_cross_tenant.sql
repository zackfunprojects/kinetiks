-- ============================================================
-- Cross-tenant isolation: kinetiks_app_activations
--
-- Read isolation: a user sees only their own app activations.
-- Carries user SELECT + INSERT + UPDATE policies; write-deny
-- negatives land in Phase 4. Phase 1 proves the read boundary.
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-appact');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-appact');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_app_activations (account_id, app_name)
  VALUES (alice_account, 'hv'),
         (bob_account,   'hv');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_app_activations),
  1,
  'app_activations: alice sees exactly her own activation, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_app_activations),
  current_setting('test.alice_account'),
  'app_activations: the only visible activation belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
