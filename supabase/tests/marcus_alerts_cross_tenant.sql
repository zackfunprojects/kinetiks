-- ============================================================
-- Cross-tenant isolation: kinetiks_marcus_alerts
--
-- Account-scoped read boundary. A user sees only their own alerts.
-- Subquery-fallback path (no account_id claim set).
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-alert');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-alert');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_marcus_alerts (account_id, trigger_type, title, body)
  VALUES (alice_account, 'kpi_shift', 'alice alert', 'body'),
         (bob_account,   'kpi_shift', 'bob alert',   'body');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_marcus_alerts),
  1,
  'marcus_alerts: alice sees exactly her own alert, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_marcus_alerts),
  current_setting('test.alice_account'),
  'marcus_alerts: the only visible alert belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
