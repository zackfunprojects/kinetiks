-- Shared pgTAP setup. Source this once before running tests.
CREATE EXTENSION IF NOT EXISTS pgtap;

-- Test helpers: create a seeded user + account pair under a chosen UUID.
-- Used by every cross-tenant test. The created records are rolled back by
-- the wrapping BEGIN/ROLLBACK in the test file.
CREATE OR REPLACE FUNCTION _kt_test_seed_account(
  p_user_id uuid,
  p_codename text,
  p_email text DEFAULT 'pgtap-user@example.test'
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  account_id uuid;
BEGIN
  -- Skip auth.users insert if it already exists for this UUID
  INSERT INTO auth.users (id, email, instance_id, aud, role)
  VALUES (p_user_id, p_email, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO kinetiks_accounts (user_id, codename, display_name, onboarding_complete)
  VALUES (p_user_id, p_codename, p_codename, true)
  RETURNING id INTO account_id;

  RETURN account_id;
END;
$$;

-- Set the current JWT to a specific user — used to exercise RLS as that user.
CREATE OR REPLACE FUNCTION _kt_test_set_auth_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true);
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
