-- ============================================================
-- Cross-tenant isolation: kinetiks_approvals
--
-- Read isolation: a user sees only their own approval requests.
-- (State-machine transitions are covered by approvals_state_machine.sql;
-- this suite covers the tenant read boundary the Phase 3 cutover needs.)
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-appr');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-appr');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_approvals (account_id, source_app, action_category, approval_type, title)
  VALUES (alice_account, 'id', 'outreach', 'quick', 'alice approval'),
         (bob_account,   'id', 'outreach', 'quick', 'bob approval');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_approvals),
  1,
  'approvals: alice sees exactly her own approval, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_approvals),
  current_setting('test.alice_account'),
  'approvals: the only visible approval belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
