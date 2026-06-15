-- ============================================================
-- Service-role posture: kinetiks_rate_limits
--
-- rate_limits is keyed by api_key (key_id), not by account, and carries
-- only a "Service role full access" policy — RLS is enabled with no
-- account-scoped policy, so authenticated users see and write NOTHING
-- (default deny). The service role (the rate-limit checker) manages it.
-- This suite proves that posture: the row is visible without RLS, invisible
-- to an authenticated user, and an authenticated insert is denied.
-- ============================================================

BEGIN;
SELECT plan(3);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  alice_account uuid;
  alice_key uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'cf-rl');

  INSERT INTO kinetiks_api_keys (account_id, key_hash, key_prefix, name)
  VALUES (alice_account, 'hash-rl-alice', 'kntk_a', 'alice key')
  RETURNING id INTO alice_key;
  PERFORM set_config('test.alice_key', alice_key::text, true);

  INSERT INTO kinetiks_rate_limits (key_id, window_start, window_type)
  VALUES (alice_key, now(), 'minute');
END $$;

-- Without RLS (default privileged role): the seeded row is present.
SELECT is(
  (SELECT count(*)::int FROM kinetiks_rate_limits),
  1,
  'rate_limits: the seeded row exists (visible without RLS)'
);

-- Authenticated: default deny — sees nothing, cannot insert.
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_rate_limits),
  0,
  'rate_limits: authenticated users see no rows (no account-scoped policy)'
);
SELECT throws_ok(
  $$ INSERT INTO kinetiks_rate_limits (key_id, window_start, window_type)
     VALUES (current_setting('test.alice_key')::uuid, now(), 'day') $$,
  '42501',
  NULL,
  'rate_limits: authenticated users cannot insert rate-limit rows'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
