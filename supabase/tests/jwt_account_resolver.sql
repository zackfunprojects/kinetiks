-- ============================================================
-- JWT account resolver: public.kinetiks_account_id()
--
-- Validates the F1 cutover foundation (00084). The resolver is
-- coalesce(claim, subquery): the account_id JWT claim wins when present,
-- the kinetiks_accounts subquery on auth.uid() is the fallback. Both must
-- resolve the same account for a given user (the invariant /api/health's
-- claim_matches_db checks), and the claim must be authoritative when set.
--
-- The harness injects claims via set_config (see _setup.sql); it never
-- mints through GoTrue, so these assertions exercise the resolver SQL
-- directly. kinetiks_accounts.user_id is UNIQUE, so a single user cannot
-- own two accounts — the multi-account ORDER BY is forward-compat hygiene
-- and is exercised cross-USER in custom_access_token_hook.sql.
-- ============================================================

BEGIN;
SELECT plan(6);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user   uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'cf-resolver-alice');
  bob_account   := _kt_test_seed_account(bob_user, 'cf-resolver-bob');
  PERFORM set_config('test.alice_account', alice_account::text, true);
  PERFORM set_config('test.bob_account', bob_account::text, true);
END $$;

-- ── 1. Claim wins over the subquery (mismatch proves the claim branch) ──
-- Alice's sub, but a fabricated account_id claim. The resolver must return
-- the claim, never the subquery result — proving the claim branch fires.
SELECT _kt_test_set_auth_user(
  '11111111-1111-1111-1111-111111111111'::uuid,
  'deadbeef-0000-0000-0000-000000000000'::uuid
);
SELECT is(
  public.kinetiks_account_id(),
  'deadbeef-0000-0000-0000-000000000000'::uuid,
  'claim is authoritative: resolver returns the account_id claim, not the subquery'
);
SELECT _kt_test_clear_auth();

-- ── 2. Claim present and real → that account ────────────────
SELECT _kt_test_set_auth_user(
  '11111111-1111-1111-1111-111111111111'::uuid,
  current_setting('test.alice_account')::uuid
);
SELECT is(
  public.kinetiks_account_id(),
  current_setting('test.alice_account')::uuid,
  'claim present (real): resolver returns the claimed account'
);
SELECT _kt_test_clear_auth();

-- ── 3. Claim absent → subquery fallback resolves the same account ──
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111'::uuid);
SELECT is(
  public.kinetiks_account_id(),
  current_setting('test.alice_account')::uuid,
  'claim absent: resolver falls back to the kinetiks_accounts subquery'
);
SELECT _kt_test_clear_auth();

-- ── 4. Fallback is correctly scoped per user (cross-tenant) ──
SELECT _kt_test_set_auth_user('22222222-2222-2222-2222-222222222222'::uuid);
SELECT is(
  public.kinetiks_account_id(),
  current_setting('test.bob_account')::uuid,
  'fallback resolves Bob to Bob''s account'
);
SELECT isnt(
  public.kinetiks_account_id(),
  current_setting('test.alice_account')::uuid,
  'fallback never resolves Bob to Alice''s account'
);
SELECT _kt_test_clear_auth();

-- ── 5. No account row and no claim → null (no spurious resolution) ──
SELECT _kt_test_set_auth_user('33333333-3333-3333-3333-333333333333'::uuid);
SELECT is(
  public.kinetiks_account_id(),
  NULL,
  'no account and no claim: resolver returns null'
);
SELECT _kt_test_clear_auth();

SELECT * FROM finish();
ROLLBACK;
