-- ============================================================
-- Cross-tenant isolation: kinetiks_analytics_metrics
--
-- Account-scoped read boundary ("Users see own metrics", FOR ALL). A user
-- sees only their own analytics rows. Auth here carries no account_id claim,
-- so this exercises the resolver's subquery fallback path post-cutover.
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-am');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-am');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_analytics_metrics
    (account_id, source_app, metric_key, metric_value, metric_period, period_start)
  VALUES
    (alice_account, 'ga4', 'sessions', 100, 'daily', now()),
    (bob_account,   'ga4', 'sessions', 200, 'daily', now());
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_analytics_metrics),
  1,
  'analytics_metrics: alice sees exactly her own metric, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_analytics_metrics),
  current_setting('test.alice_account'),
  'analytics_metrics: the only visible metric belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
