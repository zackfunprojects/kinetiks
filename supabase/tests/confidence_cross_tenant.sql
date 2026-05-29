-- ============================================================
-- Cross-tenant isolation: kinetiks_confidence
--
-- Read isolation: a user sees only their own confidence row.
-- One row per account (UNIQUE(account_id)); service role writes,
-- users hold SELECT only. Safety net for the Phase 3 cutover.
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-conf');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-conf');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_confidence (account_id)
  VALUES (alice_account),
         (bob_account);
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_confidence),
  1,
  'confidence: alice sees exactly her own row, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_confidence),
  current_setting('test.alice_account'),
  'confidence: the only visible row belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
