-- ============================================================
-- Cross-tenant isolation for kinetiks_crm_entities.
--
-- Validates migration 00036_nango_connections_and_crm.sql:
--   - Service role can insert
--   - Authenticated users read only their own account's rows
--   - Authenticated users CANNOT insert / update / delete directly
--   - Unique (account_id, source, entity_type, external_id) holds
--   - team_scope_id defaults to null
-- ============================================================

BEGIN;
SELECT plan(7);

-- ── Arrange: two accounts, one entity each ─────────────────
DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-crm');
  bob_account   := _kt_test_seed_account(bob_user, 'bright-otter-crm');

  INSERT INTO kinetiks_crm_entities (
    id, account_id, source, entity_type, external_id, data, external_updated_at
  ) VALUES
    (
      'cccccccc-1111-1111-1111-aaaaaaaaaaaa',
      alice_account, 'hubspot', 'deal', 'hs-deal-alice-1',
      '{"amount":5000,"stage":"qualified","email_lower_hash":"abc123"}'::jsonb,
      now()
    ),
    (
      'cccccccc-1111-1111-1111-bbbbbbbbbbbb',
      bob_account,   'hubspot', 'deal', 'hs-deal-bob-1',
      '{"amount":1200,"stage":"won"}'::jsonb,
      now()
    );
END $$;

-- ── Alice sees her row only ─────────────────────────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT results_eq(
  $$ SELECT id FROM kinetiks_crm_entities
     WHERE id IN (
       'cccccccc-1111-1111-1111-aaaaaaaaaaaa',
       'cccccccc-1111-1111-1111-bbbbbbbbbbbb'
     )
     ORDER BY id $$,
  $$ VALUES ('cccccccc-1111-1111-1111-aaaaaaaaaaaa'::uuid) $$,
  'alice sees her crm_entity row, not bob''s'
);

-- ── Alice cannot INSERT ─────────────────────────────────────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_crm_entities (account_id, source, entity_type, external_id, data)
     SELECT id, 'hubspot', 'deal', 'rogue-deal', '{"amount":1}'::jsonb
     FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', NULL,
  'authenticated user cannot insert into kinetiks_crm_entities'
);

-- ── Alice cannot UPDATE her own row ────────────────────────
-- No user UPDATE policy exists, so RLS filters the target to zero rows
-- rather than throwing; the row stays unchanged.
UPDATE kinetiks_crm_entities
   SET data = '{"amount":9999}'::jsonb
   WHERE id = 'cccccccc-1111-1111-1111-aaaaaaaaaaaa';
SELECT is(
  (SELECT data->>'amount' FROM kinetiks_crm_entities WHERE id = 'cccccccc-1111-1111-1111-aaaaaaaaaaaa'),
  '5000',
  'authenticated update on own crm_entities row is filtered (data unchanged)'
);

-- ── Alice cannot DELETE her own row ────────────────────────
-- No user DELETE policy: the delete filters to zero rows.
DELETE FROM kinetiks_crm_entities
  WHERE id = 'cccccccc-1111-1111-1111-aaaaaaaaaaaa';
SELECT is(
  (SELECT count(*)::int FROM kinetiks_crm_entities WHERE id = 'cccccccc-1111-1111-1111-aaaaaaaaaaaa'),
  1,
  'authenticated delete on own crm_entities row is filtered (row still exists)'
);

SELECT _kt_test_clear_auth();

-- ── Unique constraint on (account_id, source, entity_type, external_id) ─
SELECT throws_ok(
  $$ INSERT INTO kinetiks_crm_entities (account_id, source, entity_type, external_id, data)
     SELECT id, 'hubspot', 'deal', 'hs-deal-alice-1', '{"dupe":true}'::jsonb
     FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
  '23505', NULL,
  'duplicate (account_id, source, entity_type, external_id) is rejected'
);

-- ── team_scope_id defaults to null in v1 ───────────────────
SELECT is(
  (SELECT team_scope_id FROM kinetiks_crm_entities
   WHERE id = 'cccccccc-1111-1111-1111-aaaaaaaaaaaa'),
  NULL,
  'team_scope_id defaults to null in v1'
);

-- ── Bob cannot read alice ──────────────────────────────────
SELECT _kt_test_set_auth_user('22222222-2222-2222-2222-222222222222');

SELECT is_empty(
  $$ SELECT id FROM kinetiks_crm_entities
     WHERE id = 'cccccccc-1111-1111-1111-aaaaaaaaaaaa' $$,
  'bob cannot read alice''s crm_entity row'
);

SELECT * FROM finish();
ROLLBACK;
