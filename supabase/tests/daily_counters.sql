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
--   3. Per-(account, key, day) bucket isolation.
-- ============================================================

BEGIN;
SELECT plan(12);

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
