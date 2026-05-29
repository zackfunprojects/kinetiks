-- ============================================================
-- Cross-tenant isolation: kinetiks_ledger (append-only)
--
-- Read isolation: a user sees only their own ledger entries,
-- never another account's. Safety net for the Phase 3 reads
-- cutover (admin client -> anon+RLS). Ledger is append-only:
-- service role inserts, users hold SELECT only.
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-ledger');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-ledger');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_ledger (account_id, event_type, detail)
  VALUES (alice_account, 'pgtap.event', '{}'::jsonb),
         (bob_account,   'pgtap.event', '{}'::jsonb);
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_ledger),
  1,
  'ledger: alice sees exactly her own entry, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_ledger),
  current_setting('test.alice_account'),
  'ledger: the only visible entry belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
