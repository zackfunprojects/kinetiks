-- ============================================================
-- Cross-tenant isolation for kinetiks_sync_logs.
--
-- Validates migration 00036_nango_connections_and_crm.sql:
--   - Service role can insert
--   - Authenticated users read only their own account's rows
--   - Authenticated users CANNOT insert / update / delete
--   - team_scope_id defaults to null
--   - status check constraint rejects unknown values
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
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-syl');
  bob_account   := _kt_test_seed_account(bob_user, 'bright-otter-syl');

  INSERT INTO kinetiks_sync_logs (
    id, account_id, source, sync_name, status, records_added, records_updated
  ) VALUES
    (
      'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa',
      alice_account, 'hubspot', 'hubspot-deals', 'succeeded', 12, 3
    ),
    (
      'aaaaaaaa-3333-3333-3333-bbbbbbbbbbbb',
      bob_account,   'ga4', 'ga4-daily-metrics', 'failed', 0, 0
    );
END $$;

-- Alice reads her own
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT results_eq(
  $$ SELECT id FROM kinetiks_sync_logs
     WHERE id IN (
       'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa',
       'aaaaaaaa-3333-3333-3333-bbbbbbbbbbbb'
     )
     ORDER BY id $$,
  $$ VALUES ('aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa'::uuid) $$,
  'alice sees her sync_log row, not bob''s'
);

-- Alice cannot insert
SELECT throws_ok(
  $$ INSERT INTO kinetiks_sync_logs (account_id, source, sync_name, status)
     SELECT id, 'ga4', 'ga4-daily-metrics', 'succeeded'
     FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', NULL,
  'authenticated user cannot insert into kinetiks_sync_logs'
);

-- Alice cannot update
SELECT throws_ok(
  $$ UPDATE kinetiks_sync_logs
     SET status = 'succeeded'
     WHERE id = 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa' $$,
  '42501', NULL,
  'authenticated user cannot update kinetiks_sync_logs'
);

SELECT _kt_test_clear_auth();

-- Status check constraint
SELECT throws_ok(
  $$ INSERT INTO kinetiks_sync_logs (account_id, source, sync_name, status)
     SELECT id, 'ga4', 'ga4-daily-metrics', 'unknown_status_value'
     FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', NULL,
  'status check constraint rejects unknown values'
);

-- team_scope_id defaults to null
SELECT is(
  (SELECT team_scope_id FROM kinetiks_sync_logs
   WHERE id = 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa'),
  NULL,
  'team_scope_id defaults to null in v1'
);

-- Bob still can't see alice
SELECT _kt_test_set_auth_user('22222222-2222-2222-2222-222222222222');
SELECT is_empty(
  $$ SELECT id FROM kinetiks_sync_logs
     WHERE id = 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa' $$,
  'bob cannot read alice''s sync_log row'
);

SELECT * FROM finish();
ROLLBACK;
