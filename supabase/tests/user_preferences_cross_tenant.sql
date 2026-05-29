-- ============================================================
-- Cross-tenant isolation: kinetiks_user_preferences
--
-- Validates the migration in 00031_user_preferences.sql:
--   - Alice cannot read Bob's row
--   - Alice cannot update Bob's row
--   - Alice can read/insert/update her own row
--   - Default theme is 'light'
--   - CHECK constraint rejects bogus theme values
-- ============================================================

BEGIN;
SELECT plan(8);

-- ── Arrange: two seeded users (no account row needed; the table is
--    keyed by auth.users.id directly). _kt_test_seed_account makes both
--    rows but we only need the user_id values.
DO $$
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role)
  VALUES
    ('11111111-1111-1111-1111-111111111111', 'alice@example.test',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    ('22222222-2222-2222-2222-222222222222', 'bob@example.test',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Seed Bob's preference as service role
INSERT INTO kinetiks_user_preferences (user_id, theme)
VALUES ('22222222-2222-2222-2222-222222222222', 'dark');

-- ── Alice acts as authenticated user ─────────────────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is_empty(
  $$ SELECT user_id FROM kinetiks_user_preferences WHERE user_id = '22222222-2222-2222-2222-222222222222' $$,
  'alice cannot read bob''s preferences row'
);

-- Alice inserts her own row with the default theme (no theme given).
-- (Note: user_preferences has no user DELETE policy by design, so the
-- default is verified on a fresh insert rather than a delete+reinsert.)
SELECT lives_ok(
  $$ INSERT INTO kinetiks_user_preferences (user_id) VALUES ('11111111-1111-1111-1111-111111111111') $$,
  'alice can insert her own preferences row'
);
SELECT is(
  (SELECT theme FROM kinetiks_user_preferences WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  'light',
  'default theme is light'
);

-- Alice updates her own theme.
SELECT lives_ok(
  $$ UPDATE kinetiks_user_preferences SET theme = 'dark' WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
  'alice can update her own preferences row'
);
SELECT is(
  (SELECT theme FROM kinetiks_user_preferences WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  'dark',
  'alice''s theme updates to dark'
);

-- Alice tries to update Bob's row — RLS filters it out (no rows affected)
SELECT lives_ok(
  $$ UPDATE kinetiks_user_preferences SET theme = 'light' WHERE user_id = '22222222-2222-2222-2222-222222222222' $$,
  'alice''s update against bob''s row runs (RLS filters)'
);

SELECT _kt_test_clear_auth();

SELECT is(
  (SELECT theme FROM kinetiks_user_preferences WHERE user_id = '22222222-2222-2222-2222-222222222222'),
  'dark',
  'bob''s theme unchanged after alice''s update attempt'
);

-- ── CHECK constraint rejects invalid theme values ───────────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_user_preferences (user_id, theme) VALUES ('33333333-3333-3333-3333-333333333333', 'midnight') $$,
  '23514',
  NULL,
  'theme check constraint rejects values outside (light, dark)'
);

SELECT * FROM finish();
ROLLBACK;
