-- ============================================================
-- Cross-tenant isolation: kinetiks_synapses
--
-- Read isolation: a user sees only their own registered synapses.
-- Service role writes; users hold SELECT only. Safety net for the
-- Phase 3 reads cutover.
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-syn');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-syn');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_synapses (account_id, app_name)
  VALUES (alice_account, 'hv'),
         (bob_account,   'hv');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_synapses),
  1,
  'synapses: alice sees exactly her own synapse, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_synapses),
  current_setting('test.alice_account'),
  'synapses: the only visible synapse belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
