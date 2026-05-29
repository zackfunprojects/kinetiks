-- ============================================================
-- Cross-tenant isolation: kinetiks_routing_events
--
-- Read isolation: a user sees only their own routing events.
-- Safety net for the Phase 3 reads cutover. Service role inserts;
-- users hold SELECT only.
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-routing');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-routing');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_routing_events (account_id, target_app, payload)
  VALUES (alice_account, 'hv', '{}'::jsonb),
         (bob_account,   'hv', '{}'::jsonb);
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_routing_events),
  1,
  'routing_events: alice sees exactly her own event, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_routing_events),
  current_setting('test.alice_account'),
  'routing_events: the only visible event belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
