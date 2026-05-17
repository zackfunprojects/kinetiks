-- ============================================================
-- Cross-tenant isolation: kinetiks_metric_cache
--
-- Validates the migration in 00034_metric_cache.sql:
--   - Service role can insert
--   - Authenticated users read only their own account's rows
--   - Authenticated users CANNOT insert directly
--   - Cache key uniqueness on (account_id, source, normalized_input_hash)
--   - Advisory lock helpers exist and require service_role
-- ============================================================

BEGIN;
SELECT plan(7);

-- ── Arrange: two accounts, one cache row each (service role) ───
DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-mc');
  bob_account   := _kt_test_seed_account(bob_user, 'bright-otter-mc');

  INSERT INTO kinetiks_metric_cache (
    id, account_id, source, normalized_input_hash,
    input, response, refreshed_at, stale_after_seconds, expires_at
  ) VALUES
    (
      'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa',
      alice_account, 'ga4', 'hash-alice-001',
      '{"metric":"ga4_sessions","date_range":"last_7_days"}'::jsonb,
      '{"rows":[{"value":1000}],"metric_unit":"count"}'::jsonb,
      now(), 900, now() + interval '900 seconds'
    ),
    (
      'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb',
      bob_account, 'ga4', 'hash-bob-001',
      '{"metric":"ga4_sessions","date_range":"last_7_days"}'::jsonb,
      '{"rows":[{"value":2000}],"metric_unit":"count"}'::jsonb,
      now(), 900, now() + interval '900 seconds'
    );
END $$;

-- ── Alice reads her own only ──────────────────────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT results_eq(
  $$ SELECT id FROM kinetiks_metric_cache WHERE id IN ('aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa', 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb') ORDER BY id $$,
  $$ VALUES ('aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa'::uuid) $$,
  'alice sees her metric_cache row but not bob''s'
);

-- ── Alice cannot INSERT ──────────────────────────────────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_metric_cache (account_id, source, normalized_input_hash, input, response, stale_after_seconds, expires_at)
     SELECT id, 'ga4', 'rogue-hash',
       '{"metric":"ga4_sessions"}'::jsonb,
       '{"rows":[]}'::jsonb,
       900, now() + interval '900 seconds'
     FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  NULL,
  'authenticated user cannot insert into kinetiks_metric_cache (no client INSERT policy)'
);

-- ── Alice cannot UPDATE her row ───────────────────────────
SELECT throws_ok(
  $$ UPDATE kinetiks_metric_cache
     SET response = '{"rows":[{"value":9999}]}'::jsonb
     WHERE id = 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa' $$,
  '42501',
  NULL,
  'authenticated user cannot update kinetiks_metric_cache (no client UPDATE policy)'
);

-- ── Authenticated cannot call advisory lock RPCs ─────────
SELECT throws_ok(
  $$ SELECT _kt_try_advisory_lock('123') $$,
  '42501',
  NULL,
  'authenticated user cannot call advisory lock helpers (service_role only)'
);

SELECT _kt_test_clear_auth();

-- ── Cache key uniqueness rejects duplicate (account, source, hash) ─
SELECT throws_ok(
  $$ INSERT INTO kinetiks_metric_cache (account_id, source, normalized_input_hash, input, response, stale_after_seconds, expires_at)
     SELECT id, 'ga4', 'hash-alice-001',
       '{"metric":"ga4_sessions"}'::jsonb,
       '{"rows":[]}'::jsonb,
       900, now() + interval '900 seconds'
     FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
  '23505',
  NULL,
  'cache key uniqueness rejects duplicate (account_id, source, normalized_input_hash)'
);

-- A different normalized_input_hash for the same (account, source) is fine
SELECT lives_ok(
  $$ INSERT INTO kinetiks_metric_cache (account_id, source, normalized_input_hash, input, response, stale_after_seconds, expires_at)
     SELECT id, 'ga4', 'hash-alice-002',
       '{"metric":"ga4_users"}'::jsonb,
       '{"rows":[]}'::jsonb,
       900, now() + interval '900 seconds'
     FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
  'different normalized_input_hash inserts cleanly for same (account, source)'
);

-- ── Bob still cannot read alice ───────────────────────────
SELECT _kt_test_set_auth_user('22222222-2222-2222-2222-222222222222');

SELECT is_empty(
  $$ SELECT id FROM kinetiks_metric_cache WHERE id = 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa' $$,
  'bob cannot read alice''s metric_cache row'
);

SELECT * FROM finish();
ROLLBACK;
