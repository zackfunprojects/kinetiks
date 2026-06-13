-- ============================================================
-- kinetiks_daily_counters + reserve/release RPCs (E2).
--
-- Three things under test:
--   1. The atomic reservation semantics: reservations accumulate,
--      a reservation that would cross the cap is refused (NULL) and
--      leaves the bucket untouched, release floors at zero, and a
--      first reservation larger than the cap is refused outright.
--   2. Service-role-only posture: authenticated users see and write
--      NOTHING (default deny, no policies by design) and cannot
--      execute the RPCs.
--   3. Per-(account, key, day) bucket isolation — including the
--      cross-tenant case: a second account reserving on a (key, day)
--      the first already used gets a wholly independent bucket, and the
--      first account's bucket is untouched. Isolation on this
--      service-role table is enforced by the RPC's account_id keying +
--      UNIQUE(account_id, counter_key, day_utc), not by user RLS (which
--      is default-deny for everyone).
-- ============================================================

BEGIN;
SELECT plan(15);

DO $$
DECLARE
  erin_user uuid := '35555555-5555-5555-5555-555555555555';
  erin_account uuid;
BEGIN
  erin_account := _kt_test_seed_account(erin_user, 'se-erin');
  PERFORM set_config('test.erin_account', erin_account::text, true);
END $$;

-- 1. Reservation semantics (as service role).
SELECT is(
  _kt_reserve_daily_counter(
    current_setting('test.erin_account')::uuid,
    'authority_spend:g_test', '2026-06-12'::date, 40, 100
  ),
  40::numeric,
  'daily_counters: first reservation lands and returns the running total'
);
SELECT is(
  _kt_reserve_daily_counter(
    current_setting('test.erin_account')::uuid,
    'authority_spend:g_test', '2026-06-12'::date, 60, 100
  ),
  100::numeric,
  'daily_counters: a second reservation accumulates to exactly the cap'
);
SELECT is(
  _kt_reserve_daily_counter(
    current_setting('test.erin_account')::uuid,
    'authority_spend:g_test', '2026-06-12'::date, 1, 100
  ),
  NULL,
  'daily_counters: a reservation crossing the cap is refused (NULL)'
);
SELECT is(
  (SELECT amount FROM kinetiks_daily_counters
   WHERE account_id = current_setting('test.erin_account')::uuid
     AND counter_key = 'authority_spend:g_test'
     AND day_utc = '2026-06-12'),
  100::numeric,
  'daily_counters: a refused reservation leaves the bucket untouched'
);
SELECT is(
  _kt_release_daily_counter(
    current_setting('test.erin_account')::uuid,
    'authority_spend:g_test', '2026-06-12'::date, 30
  ),
  70::numeric,
  'daily_counters: release decrements the bucket'
);
SELECT is(
  _kt_release_daily_counter(
    current_setting('test.erin_account')::uuid,
    'authority_spend:g_test', '2026-06-12'::date, 999
  ),
  0::numeric,
  'daily_counters: release floors at zero'
);
SELECT is(
  _kt_reserve_daily_counter(
    current_setting('test.erin_account')::uuid,
    'system_email', '2026-06-12'::date, 25, 20
  ),
  NULL,
  'daily_counters: a first reservation larger than the cap is refused'
);
SELECT is(
  _kt_reserve_daily_counter(
    current_setting('test.erin_account')::uuid,
    'authority_spend:g_test', '2026-06-13'::date, 100, 100
  ),
  100::numeric,
  'daily_counters: a new day is a fresh bucket'
);
SELECT throws_ok(
  $$ SELECT _kt_reserve_daily_counter(
       current_setting('test.erin_account')::uuid,
       'authority_spend:g_test', '2026-06-12'::date, 0, 100) $$,
  'P0001',
  NULL,
  'daily_counters: zero/negative amounts are rejected'
);

-- 1b. Cross-tenant bucket isolation. A SECOND account reserves on the
-- exact (counter_key, day_utc) erin already used on 2026-06-13 (where
-- erin's bucket = 100, at cap). With per-account keying it is a fresh
-- bucket: alex's reservation succeeds to its own cap and erin's bucket
-- is untouched.
DO $$
DECLARE
  alex_user uuid := '36666666-6666-6666-6666-666666666666';
  alex_account uuid;
BEGIN
  alex_account := _kt_test_seed_account(alex_user, 'se-alex');
  PERFORM set_config('test.alex_account', alex_account::text, true);
END $$;

SELECT is(
  _kt_reserve_daily_counter(
    current_setting('test.alex_account')::uuid,
    'authority_spend:g_test', '2026-06-13'::date, 100, 100
  ),
  100::numeric,
  'daily_counters: account B reserves the full cap on a (key, day) account A already used — independent bucket'
);
SELECT is(
  (SELECT amount FROM kinetiks_daily_counters
   WHERE account_id = current_setting('test.erin_account')::uuid
     AND counter_key = 'authority_spend:g_test'
     AND day_utc = '2026-06-13'),
  100::numeric,
  'daily_counters: account A''s bucket on the shared (key, day) is untouched by account B'
);
SELECT is(
  (SELECT count(*)::int FROM kinetiks_daily_counters
   WHERE counter_key = 'authority_spend:g_test' AND day_utc = '2026-06-13'),
  2,
  'daily_counters: the shared (key, day) holds one isolated row per account'
);

-- 2. Authenticated users: default deny + no RPC execute.
SELECT _kt_test_set_auth_user('35555555-5555-5555-5555-555555555555');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_daily_counters),
  0,
  'daily_counters: authenticated users see no counter rows (no SELECT policy)'
);
SELECT throws_ok(
  $$ INSERT INTO kinetiks_daily_counters (account_id, counter_key, day_utc, amount)
     VALUES (current_setting('test.erin_account')::uuid, 'authority_spend:g_x', '2026-06-12', 1) $$,
  '42501',
  NULL,
  'daily_counters: authenticated users cannot insert counter rows'
);
SELECT throws_ok(
  $$ SELECT _kt_reserve_daily_counter(
       current_setting('test.erin_account')::uuid,
       'authority_spend:g_test', '2026-06-12'::date, 1, 100) $$,
  '42501',
  NULL,
  'daily_counters: authenticated users cannot execute the reserve RPC'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
