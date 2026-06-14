-- ============================================================
-- Custom Access Token Hook: public.custom_access_token_hook
--
-- Validates 00069_custom_access_token_hook.sql. The hook receives a
-- GoTrue event { user_id, claims, ... } and must inject the caller's
-- kinetiks account_id into claims, preserve existing claims, and omit
-- account_id when the user has no account row.
-- ============================================================

BEGIN;
SELECT plan(6);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user   uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
  -- Two accounts in the table (different users) so the hook's WHERE +
  -- ORDER BY are proven to select the CALLER's account, not just any.
  PERFORM _kt_test_seed_account(alice_user, 'cf-hook');
  PERFORM _kt_test_seed_account(bob_user, 'cf-hook-bob');
END $$;

-- ── Injects the caller's account_id ─────────────────────────
SELECT is(
  (
    public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', '11111111-1111-1111-1111-111111111111',
        'claims', jsonb_build_object('sub', '11111111-1111-1111-1111-111111111111')
      )
    ) -> 'claims' ->> 'account_id'
  ),
  (SELECT id::text FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  'hook injects the caller''s account_id into claims'
);

-- ── Selects the CALLER's account when several accounts exist ─
-- With both Alice and Bob seeded, the hook must inject Bob's account_id
-- for Bob's event — guarding the user_id filter + deterministic ordering
-- (forward-compat for v2 multi-account; today UNIQUE(user_id) holds).
SELECT is(
  (
    public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', '22222222-2222-2222-2222-222222222222',
        'claims', jsonb_build_object('sub', '22222222-2222-2222-2222-222222222222')
      )
    ) -> 'claims' ->> 'account_id'
  ),
  (SELECT id::text FROM kinetiks_accounts WHERE user_id = '22222222-2222-2222-2222-222222222222'),
  'hook injects the caller''s own account_id when multiple accounts exist'
);

-- ── Preserves existing claims ───────────────────────────────
SELECT is(
  (
    public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', '11111111-1111-1111-1111-111111111111',
        'claims', jsonb_build_object(
          'sub', '11111111-1111-1111-1111-111111111111',
          'email', 'a@b.test'
        )
      )
    ) -> 'claims' ->> 'email'
  ),
  'a@b.test',
  'hook preserves existing claims'
);

-- ── Omits account_id when the user has no account ───────────
SELECT is(
  (
    public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', '99999999-9999-9999-9999-999999999999',
        'claims', jsonb_build_object('sub', '99999999-9999-9999-9999-999999999999')
      )
    ) -> 'claims' ->> 'account_id'
  ),
  NULL,
  'hook omits account_id when the user has no account'
);

-- ── Production invoker path: supabase_auth_admin grants ──────
-- GoTrue invokes the hook as supabase_auth_admin. Verifying via SET ROLE
-- is not possible in the test harness (the test role cannot assume
-- supabase_auth_admin -> 42501), so assert the grants the hook actually
-- needs directly: EXECUTE on the function and SELECT on kinetiks_accounts
-- (both granted by 00069). Together these prove the production invoker can
-- run the hook and read the account row.
SELECT ok(
  has_function_privilege(
    'supabase_auth_admin',
    'public.custom_access_token_hook(jsonb)',
    'EXECUTE'
  ),
  'supabase_auth_admin has EXECUTE on custom_access_token_hook'
);
SELECT ok(
  has_table_privilege(
    'supabase_auth_admin',
    'public.kinetiks_accounts',
    'SELECT'
  ),
  'supabase_auth_admin has SELECT on kinetiks_accounts (hook table read)'
);

SELECT * FROM finish();
ROLLBACK;
