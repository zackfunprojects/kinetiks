-- ============================================================
-- JWT cutover (batch 1) — claim-path isolation through migrated policies.
--
-- The existing *_cross_tenant.sql suites authenticate WITHOUT an account_id
-- claim, so they exercise the resolver's subquery FALLBACK path (and keep
-- passing after 00085). This suite exercises the CLAIM path: it sets the
-- account_id JWT claim and proves, through real policies migrated in 00085,
-- that (a) the claim isolates a tenant and (b) the claim is authoritative —
-- a session whose sub is Alice but whose account_id claim is Bob's sees
-- BOB's rows, because the migrated policy resolves account via the claim.
--
-- Representative tables span the batch: a context layer (separate
-- read/insert/update policies), a FOR ALL policy, a parent table, and the
-- service-role-write/user-read connections table.
-- ============================================================

BEGIN;
SELECT plan(8);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user   uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'cf-claim-alice');
  bob_account   := _kt_test_seed_account(bob_user,   'cf-claim-bob');
  PERFORM set_config('test.alice_account', alice_account::text, true);
  PERFORM set_config('test.bob_account', bob_account::text, true);

  -- Seed one row per tenant in each representative table (as postgres,
  -- bypassing RLS).
  INSERT INTO kinetiks_context_org (account_id, data, confidence_score, source)
  VALUES (alice_account, jsonb_build_object('owner','alice'), 50, 'pgtap'),
         (bob_account,   jsonb_build_object('owner','bob'),   50, 'pgtap');

  INSERT INTO kinetiks_goals (account_id, name, type)
  VALUES (alice_account, 'alice goal', 'kpi_target'),
         (bob_account,   'bob goal',   'kpi_target');

  INSERT INTO kinetiks_marcus_threads (account_id, title)
  VALUES (alice_account, 'alice thread'),
         (bob_account,   'bob thread');

  INSERT INTO kinetiks_connections (account_id, provider)
  VALUES (alice_account, 'ga4'),
         (bob_account,   'ga4');
END $$;

-- ── (a) Claim isolates: Alice's claim sees ONLY Alice's rows ──
SELECT _kt_test_set_auth_user(
  '11111111-1111-1111-1111-111111111111'::uuid,
  current_setting('test.alice_account')::uuid
);
SELECT is(
  (SELECT string_agg(account_id::text, ',' ORDER BY account_id) FROM kinetiks_context_org),
  current_setting('test.alice_account'),
  'context_org: alice claim sees only alice'
);
SELECT is(
  (SELECT string_agg(account_id::text, ',' ORDER BY account_id) FROM kinetiks_goals),
  current_setting('test.alice_account'),
  'goals: alice claim sees only alice'
);
SELECT is(
  (SELECT string_agg(account_id::text, ',' ORDER BY account_id) FROM kinetiks_marcus_threads),
  current_setting('test.alice_account'),
  'marcus_threads: alice claim sees only alice'
);
SELECT is(
  (SELECT string_agg(account_id::text, ',' ORDER BY account_id) FROM kinetiks_connections),
  current_setting('test.alice_account'),
  'connections: alice claim sees only alice'
);
SELECT _kt_test_clear_auth();

-- ── (b) Claim is authoritative: Alice's sub + Bob's account_id claim
--        resolves to Bob through the migrated policy (sees Bob's rows) ──
SELECT _kt_test_set_auth_user(
  '11111111-1111-1111-1111-111111111111'::uuid,
  current_setting('test.bob_account')::uuid
);
SELECT is(
  (SELECT string_agg(account_id::text, ',' ORDER BY account_id) FROM kinetiks_context_org),
  current_setting('test.bob_account'),
  'context_org: claim authoritative (alice sub + bob claim sees bob)'
);
SELECT is(
  (SELECT string_agg(account_id::text, ',' ORDER BY account_id) FROM kinetiks_goals),
  current_setting('test.bob_account'),
  'goals: claim authoritative (alice sub + bob claim sees bob)'
);
SELECT is(
  (SELECT string_agg(account_id::text, ',' ORDER BY account_id) FROM kinetiks_marcus_threads),
  current_setting('test.bob_account'),
  'marcus_threads: claim authoritative (alice sub + bob claim sees bob)'
);
SELECT is(
  (SELECT string_agg(account_id::text, ',' ORDER BY account_id) FROM kinetiks_connections),
  current_setting('test.bob_account'),
  'connections: claim authoritative (alice sub + bob claim sees bob)'
);
SELECT _kt_test_clear_auth();

SELECT * FROM finish();
ROLLBACK;
