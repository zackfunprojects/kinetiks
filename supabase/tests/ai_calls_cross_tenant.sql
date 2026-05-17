-- ============================================================
-- Cross-tenant isolation: kinetiks_ai_calls
--
-- Validates the migration in 00032_ai_and_tool_calls.sql:
--   - Service role can insert
--   - Authenticated users read only their own account's rows
--   - Authenticated users CANNOT insert directly (no INSERT policy)
--   - status check constraint rejects unknown values
--   - team_scope_id is null by default (v1)
-- ============================================================

BEGIN;
SELECT plan(7);

-- ── Arrange: two accounts, one AI call each (service role inserts)
DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-ac');
  bob_account   := _kt_test_seed_account(bob_user, 'bright-otter-ac');

  INSERT INTO kinetiks_ai_calls (id, account_id, task, model, attempt_number, status, latency_ms)
  VALUES
    ('aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa', alice_account, 'marcus.pre_analysis', 'claude-haiku-4-5-20251001', 1, 'success', 320),
    ('bbbbbbbb-0000-0000-0000-bbbbbbbbbbbb', bob_account,   'marcus.pre_analysis', 'claude-haiku-4-5-20251001', 1, 'success', 280);
END $$;

-- ── Alice authenticated: reads only her own row ─────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT results_eq(
  $$ SELECT id FROM kinetiks_ai_calls WHERE id IN ('aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa', 'bbbbbbbb-0000-0000-0000-bbbbbbbbbbbb') ORDER BY id $$,
  $$ VALUES ('aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa'::uuid) $$,
  'alice sees her ai_calls row but not bob''s'
);

-- ── Alice cannot INSERT (no client policy declared) ─────────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_ai_calls (account_id, task, model, attempt_number, status, latency_ms)
     SELECT id, 'rogue.task', 'claude-haiku-4-5-20251001', 1, 'success', 10
     FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  NULL,
  'authenticated user cannot insert into kinetiks_ai_calls (no client INSERT policy)'
);

SELECT _kt_test_clear_auth();

-- ── status check constraint rejects unknown values ──────────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_ai_calls (task, model, attempt_number, status, latency_ms)
     VALUES ('test.task', 'claude-haiku-4-5-20251001', 1, 'wat', 10) $$,
  '23514',
  NULL,
  'status check constraint rejects unknown enum values'
);

-- ── team_scope_id defaults to null in v1 ────────────────────
SELECT is(
  (SELECT team_scope_id FROM kinetiks_ai_calls WHERE id = 'aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa'),
  NULL,
  'team_scope_id is null by default (v1 placeholder)'
);

-- ── metadata defaults to empty jsonb object ─────────────────
SELECT is(
  (SELECT metadata FROM kinetiks_ai_calls WHERE id = 'aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa'),
  '{}'::jsonb,
  'metadata defaults to empty jsonb object'
);

-- ── attempt_number defaults to 1 ────────────────────────────
INSERT INTO kinetiks_ai_calls (id, task, model, status, latency_ms)
VALUES ('cccccccc-0000-0000-0000-cccccccccccc', 'attempt.default.test', 'claude-haiku-4-5-20251001', 'success', 10);

SELECT is(
  (SELECT attempt_number FROM kinetiks_ai_calls WHERE id = 'cccccccc-0000-0000-0000-cccccccccccc'),
  1,
  'attempt_number defaults to 1'
);

-- ── Cross-tenant check via Bob ──────────────────────────────
SELECT _kt_test_set_auth_user('22222222-2222-2222-2222-222222222222');

SELECT is_empty(
  $$ SELECT id FROM kinetiks_ai_calls WHERE id = 'aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa' $$,
  'bob cannot read alice''s ai_calls row'
);

SELECT * FROM finish();
ROLLBACK;
