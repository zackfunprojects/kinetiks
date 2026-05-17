-- ============================================================
-- Cross-tenant isolation: kinetiks_tool_calls
--
-- Validates the migration in 00032_ai_and_tool_calls.sql:
--   - Service role can insert
--   - Authenticated users read only their own account's rows
--   - Authenticated users CANNOT insert directly
--   - Idempotency uniqueness is enforced per (account_id, tool_name, idempotency_key)
--   - status + authority_outcome check constraints reject unknown values
-- ============================================================

BEGIN;
SELECT plan(7);

-- ── Arrange: two accounts, one tool call each (service role) ───
DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-tc');
  bob_account   := _kt_test_seed_account(bob_user, 'bright-otter-tc');

  INSERT INTO kinetiks_tool_calls (id, account_id, tool_name, is_consequential, status, latency_ms)
  VALUES
    ('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', alice_account, 'ga4_query', false, 'success', 410),
    ('bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb', bob_account,   'ga4_query', false, 'success', 390);

  -- Insert one with idempotency key for the uniqueness test
  INSERT INTO kinetiks_tool_calls (account_id, tool_name, is_consequential, status, latency_ms, idempotency_key)
  VALUES (alice_account, 'hv_send_email', true, 'success', 800, 'idem-key-001');
END $$;

-- ── Alice reads her own only ──────────────────────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT results_eq(
  $$ SELECT id FROM kinetiks_tool_calls WHERE id IN ('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb') ORDER BY id $$,
  $$ VALUES ('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa'::uuid) $$,
  'alice sees her tool_calls row but not bob''s'
);

-- ── Alice cannot INSERT ──────────────────────────────────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_tool_calls (account_id, tool_name, is_consequential, status, latency_ms)
     SELECT id, 'rogue_tool', false, 'success', 10
     FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  NULL,
  'authenticated user cannot insert into kinetiks_tool_calls (no client INSERT policy)'
);

SELECT _kt_test_clear_auth();

-- ── status check rejects unknown values ──────────────────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_tool_calls (tool_name, is_consequential, status, latency_ms)
     VALUES ('test_tool', false, 'wat', 10) $$,
  '23514',
  NULL,
  'status check constraint rejects unknown enum values'
);

-- ── authority_outcome check rejects unknown values ───────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_tool_calls (tool_name, is_consequential, status, authority_outcome, latency_ms)
     VALUES ('test_tool', true, 'success', 'magic', 10) $$,
  '23514',
  NULL,
  'authority_outcome check constraint rejects unknown enum values'
);

-- ── Idempotency uniqueness per (account_id, tool_name, key) ─
SELECT throws_ok(
  $$ INSERT INTO kinetiks_tool_calls (account_id, tool_name, is_consequential, status, latency_ms, idempotency_key)
     SELECT id, 'hv_send_email', true, 'success', 800, 'idem-key-001'
     FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
  '23505',
  NULL,
  'idempotency uniqueness rejects duplicate (account_id, tool_name, idempotency_key)'
);

-- A different idempotency key is fine
SELECT lives_ok(
  $$ INSERT INTO kinetiks_tool_calls (account_id, tool_name, is_consequential, status, latency_ms, idempotency_key)
     SELECT id, 'hv_send_email', true, 'success', 800, 'idem-key-002'
     FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
  'different idempotency_key inserts cleanly'
);

-- ── Bob still cannot read alice ───────────────────────────
SELECT _kt_test_set_auth_user('22222222-2222-2222-2222-222222222222');

SELECT is_empty(
  $$ SELECT id FROM kinetiks_tool_calls WHERE id = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa' $$,
  'bob cannot read alice''s tool_calls row'
);

SELECT * FROM finish();
ROLLBACK;
