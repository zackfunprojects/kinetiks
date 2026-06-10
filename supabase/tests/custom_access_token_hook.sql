-- ============================================================
-- Custom Access Token Hook: public.custom_access_token_hook
--
-- Validates 00069_custom_access_token_hook.sql. The hook receives a
-- GoTrue event { user_id, claims, ... } and must inject the caller's
-- kinetiks account_id into claims, preserve existing claims, and omit
-- account_id when the user has no account row.
-- ============================================================

BEGIN;
SELECT plan(5);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  PERFORM _kt_test_seed_account(alice_user, 'cf-hook');
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
