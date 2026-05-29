-- Shared pgTAP setup. Source this once before running tests.
CREATE EXTENSION IF NOT EXISTS pgtap;

-- Test helpers: create a seeded user + account pair under a chosen UUID.
-- Used by every cross-tenant test. The created records are rolled back by
-- the wrapping BEGIN/ROLLBACK in the test file.
CREATE OR REPLACE FUNCTION _kt_test_seed_account(
  p_user_id uuid,
  p_codename text,
  p_email text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  account_id uuid;
  -- Derive a unique email per user so seeding two accounts in one suite
  -- never collides on auth.users' unique-email partial index.
  v_email text := COALESCE(p_email, 'pgtap+' || replace(p_user_id::text, '-', '') || '@example.test');
BEGIN
  -- Skip auth.users insert if it already exists for this UUID
  INSERT INTO auth.users (id, email, instance_id, aud, role)
  VALUES (p_user_id, v_email, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO kinetiks_accounts (user_id, codename, display_name, onboarding_complete)
  VALUES (p_user_id, p_codename, p_codename, true)
  RETURNING id INTO account_id;

  RETURN account_id;
END;
$$;

-- Set the current JWT to a specific user — used to exercise RLS as that user.
-- SECURITY DEFINER so the account lookup bypasses RLS even when this is called
-- while already acting as another authenticated user (some suites switch users
-- without clearing auth first). Injects the account_id claim to mirror the
-- production custom_access_token_hook, so claim-based RLS policies are testable.
CREATE OR REPLACE FUNCTION _kt_test_set_auth_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_id uuid;
  v_claims jsonb;
BEGIN
  SELECT id INTO v_account_id FROM kinetiks_accounts WHERE user_id = p_user_id;

  v_claims := jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated');
  IF v_account_id IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{account_id}', to_jsonb(v_account_id::text));
  END IF;

  PERFORM set_config('request.jwt.claims', v_claims::text, true);
  PERFORM set_config('role', 'authenticated', true);
END;
$$;

-- Switch back to the postgres role (escape RLS).
CREATE OR REPLACE FUNCTION _kt_test_clear_auth()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('role', 'postgres', true);
END;
$$;
