-- ============================================================
-- Cross-tenant isolation for kinetiks_oracle_runs.
--
-- Validates migration 00037_oracle_schedule_dedup_runs.sql:
--   - Service role can insert
--   - Authenticated users read only their own account's rows
--   - Authenticated users CANNOT insert / update / delete
--   - status check constraint rejects unknown values
--   - team_scope_id defaults to null
-- ============================================================

BEGIN;
SELECT plan(6);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-orun');
  bob_account   := _kt_test_seed_account(bob_user, 'bright-otter-orun');

  INSERT INTO kinetiks_oracle_runs (
    id, account_id, status, signals_total, insights_written, sources_evaluated
  ) VALUES
    (
      'eeeeeeee-4444-4444-4444-aaaaaaaaaaaa',
      alice_account, 'succeeded', 5, 4, ARRAY['ga4','hubspot']
    ),
    (
      'eeeeeeee-4444-4444-4444-bbbbbbbbbbbb',
      bob_account,   'errored', 0, 0, ARRAY['ga4']
    );
END $$;

-- Alice reads her own
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT results_eq(
  $$ SELECT id FROM kinetiks_oracle_runs
     WHERE id IN (
       'eeeeeeee-4444-4444-4444-aaaaaaaaaaaa',
       'eeeeeeee-4444-4444-4444-bbbbbbbbbbbb'
     )
     ORDER BY id $$,
  $$ VALUES ('eeeeeeee-4444-4444-4444-aaaaaaaaaaaa'::uuid) $$,
  'alice sees her oracle_run, not bob''s'
);

-- Alice cannot insert
SELECT throws_ok(
  $$ INSERT INTO kinetiks_oracle_runs (account_id, status)
     SELECT id, 'succeeded'
     FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', NULL,
  'authenticated user cannot insert into kinetiks_oracle_runs'
);

-- Alice cannot update
SELECT throws_ok(
  $$ UPDATE kinetiks_oracle_runs
     SET signals_total = 999
     WHERE id = 'eeeeeeee-4444-4444-4444-aaaaaaaaaaaa' $$,
  '42501', NULL,
  'authenticated user cannot update kinetiks_oracle_runs'
);

SELECT _kt_test_clear_auth();

-- Status check
SELECT throws_ok(
  $$ INSERT INTO kinetiks_oracle_runs (account_id, status)
     SELECT id, 'unexpected_status'
     FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', NULL,
  'status check constraint rejects unknown values'
);

-- team_scope_id default
SELECT is(
  (SELECT team_scope_id FROM kinetiks_oracle_runs
   WHERE id = 'eeeeeeee-4444-4444-4444-aaaaaaaaaaaa'),
  NULL,
  'team_scope_id defaults to null in v1'
);

-- Bob can't read alice
SELECT _kt_test_set_auth_user('22222222-2222-2222-2222-222222222222');
SELECT is_empty(
  $$ SELECT id FROM kinetiks_oracle_runs
     WHERE id = 'eeeeeeee-4444-4444-4444-aaaaaaaaaaaa' $$,
  'bob cannot read alice''s oracle_run'
);

SELECT * FROM finish();
ROLLBACK;
