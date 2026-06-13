-- ============================================================
-- kinetiks_admins — admin membership (admin panel boundary).
--
-- Service-role-only platform state: RLS enabled with NO user policies
-- (default deny — same posture as kinetiks_daily_counters /
-- kinetiks_model_assignments). The isAdmin() gate + admin server actions
-- read/write it via the service-role client; authenticated users see and
-- write NOTHING.
--
-- Under test:
--   1. Service role can seed + read an admin row.
--   2. One admin row per user_id (UNIQUE).
--   3. Authenticated users see no rows (default-deny SELECT).
--   4. Authenticated users cannot insert (default-deny WRITE).
-- ============================================================

BEGIN;
SELECT plan(4);

DO $$
DECLARE
  admin_user uuid := '38888888-8888-8888-8888-888888888888';
BEGIN
  -- Seeds the auth.users row (FK target) + an account.
  PERFORM _kt_test_seed_account(admin_user, 'se-admin');
  INSERT INTO kinetiks_admins (user_id, role) VALUES (admin_user, 'superuser');
  PERFORM set_config('test.admin_user', admin_user::text, true);
END $$;

SELECT is(
  (SELECT count(*)::int FROM kinetiks_admins),
  1,
  'admins: service role sees the seeded admin'
);

SELECT throws_ok(
  $$ INSERT INTO kinetiks_admins (user_id, role)
     VALUES (current_setting('test.admin_user')::uuid, 'admin') $$,
  '23505',
  NULL,
  'admins: a second row for the same user_id is rejected (UNIQUE)'
);

-- Authenticated users: default deny on read and write.
SELECT _kt_test_set_auth_user('38888888-8888-8888-8888-888888888888');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_admins),
  0,
  'admins: authenticated users see no rows (no SELECT policy)'
);
SELECT throws_ok(
  $$ INSERT INTO kinetiks_admins (user_id, role)
     VALUES ('39999999-9999-9999-9999-999999999999', 'admin') $$,
  '42501',
  NULL,
  'admins: authenticated users cannot insert (default deny)'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
