-- ============================================================
-- State-machine enforcement for kinetiks_proposals.
--
-- Validates the F3 trigger in 00033_approval_state_machines_and_insights.sql:
--   - submitted → accepted | declined | escalated | expired
--   - escalated → accepted | declined | expired
--   - accepted  → superseded (only)
--   - declined / expired / superseded are terminal
-- ============================================================

BEGIN;
SELECT plan(9);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  alice_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-prop');
  INSERT INTO kinetiks_proposals (id, account_id, source_app, source_operator, target_layer, action, confidence, payload, status)
  VALUES
    ('b1111111-0000-0000-0000-aaaaaaaaaaaa', alice_account, 'kinetiks_id', 'cortex_identity_editor', 'voice', 'update', 'validated', '{}'::jsonb, 'submitted'),
    ('b1111111-0000-0000-0000-bbbbbbbbbbbb', alice_account, 'kinetiks_id', 'cortex_identity_editor', 'voice', 'update', 'validated', '{}'::jsonb, 'escalated'),
    ('b1111111-0000-0000-0000-cccccccccccc', alice_account, 'kinetiks_id', 'cortex_identity_editor', 'voice', 'update', 'validated', '{}'::jsonb, 'accepted'),
    ('b1111111-0000-0000-0000-dddddddddddd', alice_account, 'kinetiks_id', 'cortex_identity_editor', 'voice', 'update', 'validated', '{}'::jsonb, 'declined'),
    ('b1111111-0000-0000-0000-eeeeeeeeeeee', alice_account, 'kinetiks_id', 'cortex_identity_editor', 'voice', 'update', 'validated', '{}'::jsonb, 'superseded');
END $$;

-- ── allowed: submitted → accepted ───────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_proposals SET status = 'accepted' WHERE id = 'b1111111-0000-0000-0000-aaaaaaaaaaaa' $$,
  'submitted → accepted is allowed'
);

-- Re-seed for the next checks
DO $$
DECLARE
  alice_account uuid := (SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111');
BEGIN
  INSERT INTO kinetiks_proposals (id, account_id, source_app, source_operator, target_layer, action, confidence, payload, status)
  VALUES
    ('b1111111-1111-1111-1111-aaaaaaaaaaaa', alice_account, 'kinetiks_id', 'cortex_identity_editor', 'voice', 'update', 'validated', '{}'::jsonb, 'submitted'),
    ('b1111111-2222-2222-2222-aaaaaaaaaaaa', alice_account, 'kinetiks_id', 'cortex_identity_editor', 'voice', 'update', 'validated', '{}'::jsonb, 'submitted');
END $$;

SELECT lives_ok(
  $$ UPDATE kinetiks_proposals SET status = 'escalated' WHERE id = 'b1111111-1111-1111-1111-aaaaaaaaaaaa' $$,
  'submitted → escalated is allowed'
);

SELECT lives_ok(
  $$ UPDATE kinetiks_proposals SET status = 'declined' WHERE id = 'b1111111-2222-2222-2222-aaaaaaaaaaaa' $$,
  'submitted → declined is allowed'
);

-- ── allowed: escalated → accepted ───────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_proposals SET status = 'accepted' WHERE id = 'b1111111-0000-0000-0000-bbbbbbbbbbbb' $$,
  'escalated → accepted is allowed'
);

-- ── allowed: accepted → superseded ──────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_proposals SET status = 'superseded' WHERE id = 'b1111111-0000-0000-0000-cccccccccccc' $$,
  'accepted → superseded is allowed'
);

-- ── denied: terminal states locked ──────────────────────────
SELECT throws_ok(
  $$ UPDATE kinetiks_proposals SET status = 'accepted' WHERE id = 'b1111111-0000-0000-0000-dddddddddddd' $$,
  '23514', NULL,
  'declined is terminal — cannot reactivate to accepted'
);

SELECT throws_ok(
  $$ UPDATE kinetiks_proposals SET status = 'accepted' WHERE id = 'b1111111-0000-0000-0000-eeeeeeeeeeee' $$,
  '23514', NULL,
  'superseded is terminal — cannot move to accepted'
);

-- ── denied: accepted → declined (must go through superseded) ──
DO $$
DECLARE
  alice_account uuid := (SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111');
BEGIN
  INSERT INTO kinetiks_proposals (id, account_id, source_app, source_operator, target_layer, action, confidence, payload, status)
  VALUES ('b1111111-3333-3333-3333-aaaaaaaaaaaa', alice_account, 'kinetiks_id', 'cortex_identity_editor', 'voice', 'update', 'validated', '{}'::jsonb, 'accepted');
END $$;

SELECT throws_ok(
  $$ UPDATE kinetiks_proposals SET status = 'declined' WHERE id = 'b1111111-3333-3333-3333-aaaaaaaaaaaa' $$,
  '23514', NULL,
  'accepted → declined is denied (only superseded is allowed)'
);

-- ── denied: escalated → escalated is a no-op (skipped by trigger) ─
DO $$
DECLARE
  alice_account uuid := (SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111');
BEGIN
  INSERT INTO kinetiks_proposals (id, account_id, source_app, source_operator, target_layer, action, confidence, payload, status)
  VALUES ('b1111111-4444-4444-4444-aaaaaaaaaaaa', alice_account, 'kinetiks_id', 'cortex_identity_editor', 'voice', 'update', 'validated', '{}'::jsonb, 'escalated');
END $$;

SELECT throws_ok(
  $$ UPDATE kinetiks_proposals SET status = 'submitted' WHERE id = 'b1111111-4444-4444-4444-aaaaaaaaaaaa' $$,
  '23514', NULL,
  'escalated → submitted is denied (backward transitions forbidden)'
);

SELECT * FROM finish();
ROLLBACK;
