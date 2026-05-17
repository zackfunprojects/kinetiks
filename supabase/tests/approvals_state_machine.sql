-- ============================================================
-- State-machine enforcement for kinetiks_approvals.
--
-- Validates the F3 triggers in 00033_approval_state_machines_and_insights.sql:
--   - pending → approved | rejected | auto_approved | flagged | expired
--   - auto_approved → flagged (only)
--   - flagged → approved | rejected
--   - approved / rejected / expired are terminal
-- ============================================================

BEGIN;
SELECT plan(13);

-- Arrange: seed an account and a couple of approval rows
DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  alice_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-sm');

  INSERT INTO kinetiks_approvals (id, account_id, source_app, action_category, approval_type, title, preview, status, confidence_score)
  VALUES
    ('a1111111-0000-0000-0000-aaaaaaaaaaaa', alice_account, 'kinetiks_id', 'context_update_minor', 'review', 'pending row',       '{"type":"context_edit","content":{}}'::jsonb, 'pending', 95),
    ('a1111111-0000-0000-0000-bbbbbbbbbbbb', alice_account, 'kinetiks_id', 'context_update_minor', 'quick',  'auto-approved row', '{"type":"context_edit","content":{}}'::jsonb, 'auto_approved', 95),
    ('a1111111-0000-0000-0000-cccccccccccc', alice_account, 'kinetiks_id', 'context_update_minor', 'review', 'flagged row',       '{"type":"context_edit","content":{}}'::jsonb, 'flagged', 95),
    ('a1111111-0000-0000-0000-dddddddddddd', alice_account, 'kinetiks_id', 'context_update_minor', 'review', 'approved row',      '{"type":"context_edit","content":{}}'::jsonb, 'approved', 95);
END $$;

-- ── allowed: pending → approved ─────────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_approvals SET status = 'approved' WHERE id = 'a1111111-0000-0000-0000-aaaaaaaaaaaa' $$,
  'pending → approved is allowed'
);

-- Reset for next checks: re-seed a fresh pending row
INSERT INTO kinetiks_approvals (id, account_id, source_app, action_category, approval_type, title, preview, status, confidence_score)
VALUES ('a1111111-1111-1111-1111-aaaaaaaaaaaa',
        (SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111'),
        'kinetiks_id', 'context_update_minor', 'review', 'next pending',
        '{"type":"context_edit","content":{}}'::jsonb, 'pending', 95);

-- ── allowed: pending → rejected ─────────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_approvals SET status = 'rejected' WHERE id = 'a1111111-1111-1111-1111-aaaaaaaaaaaa' $$,
  'pending → rejected is allowed'
);

-- New pending for further tests
INSERT INTO kinetiks_approvals (id, account_id, source_app, action_category, approval_type, title, preview, status, confidence_score)
VALUES ('a1111111-2222-2222-2222-aaaaaaaaaaaa',
        (SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111'),
        'kinetiks_id', 'context_update_minor', 'review', 'flag candidate',
        '{"type":"context_edit","content":{}}'::jsonb, 'pending', 95);

SELECT lives_ok(
  $$ UPDATE kinetiks_approvals SET status = 'flagged' WHERE id = 'a1111111-2222-2222-2222-aaaaaaaaaaaa' $$,
  'pending → flagged is allowed'
);

-- ── allowed: auto_approved → flagged ────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_approvals SET status = 'flagged' WHERE id = 'a1111111-0000-0000-0000-bbbbbbbbbbbb' $$,
  'auto_approved → flagged is allowed (user challenges auto-approve)'
);

-- ── allowed: flagged → approved ─────────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_approvals SET status = 'approved' WHERE id = 'a1111111-0000-0000-0000-cccccccccccc' $$,
  'flagged → approved is allowed'
);

-- ── denied: terminal states locked ──────────────────────────
SELECT throws_ok(
  $$ UPDATE kinetiks_approvals SET status = 'pending' WHERE id = 'a1111111-0000-0000-0000-dddddddddddd' $$,
  '23514', NULL,
  'approved is terminal — cannot revert to pending'
);

SELECT throws_ok(
  $$ UPDATE kinetiks_approvals SET status = 'flagged' WHERE id = 'a1111111-0000-0000-0000-dddddddddddd' $$,
  '23514', NULL,
  'approved is terminal — cannot move to flagged'
);

-- Set up another already-rejected row to confirm rejected is terminal
INSERT INTO kinetiks_approvals (id, account_id, source_app, action_category, approval_type, title, preview, status, confidence_score)
VALUES ('a1111111-3333-3333-3333-aaaaaaaaaaaa',
        (SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111'),
        'kinetiks_id', 'context_update_minor', 'review', 'rejected fixture',
        '{"type":"context_edit","content":{}}'::jsonb, 'rejected', 95);

SELECT throws_ok(
  $$ UPDATE kinetiks_approvals SET status = 'pending' WHERE id = 'a1111111-3333-3333-3333-aaaaaaaaaaaa' $$,
  '23514', NULL,
  'rejected is terminal — cannot revert to pending'
);

-- expired terminal
INSERT INTO kinetiks_approvals (id, account_id, source_app, action_category, approval_type, title, preview, status, confidence_score)
VALUES ('a1111111-4444-4444-4444-aaaaaaaaaaaa',
        (SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111'),
        'kinetiks_id', 'context_update_minor', 'review', 'expired fixture',
        '{"type":"context_edit","content":{}}'::jsonb, 'expired', 95);

SELECT throws_ok(
  $$ UPDATE kinetiks_approvals SET status = 'approved' WHERE id = 'a1111111-4444-4444-4444-aaaaaaaaaaaa' $$,
  '23514', NULL,
  'expired is terminal — cannot move to approved'
);

-- ── denied: auto_approved → approved (must go through flagged) ─
INSERT INTO kinetiks_approvals (id, account_id, source_app, action_category, approval_type, title, preview, status, confidence_score)
VALUES ('a1111111-5555-5555-5555-aaaaaaaaaaaa',
        (SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111'),
        'kinetiks_id', 'context_update_minor', 'review', 'auto-approved alt',
        '{"type":"context_edit","content":{}}'::jsonb, 'auto_approved', 95);

SELECT throws_ok(
  $$ UPDATE kinetiks_approvals SET status = 'approved' WHERE id = 'a1111111-5555-5555-5555-aaaaaaaaaaaa' $$,
  '23514', NULL,
  'auto_approved → approved is denied (only flagged is allowed out of auto_approved)'
);

-- ── denied: flagged → expired (terminal-only transitions: approved/rejected) ─
INSERT INTO kinetiks_approvals (id, account_id, source_app, action_category, approval_type, title, preview, status, confidence_score)
VALUES ('a1111111-6666-6666-6666-aaaaaaaaaaaa',
        (SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111'),
        'kinetiks_id', 'context_update_minor', 'review', 'flagged alt',
        '{"type":"context_edit","content":{}}'::jsonb, 'flagged', 95);

SELECT throws_ok(
  $$ UPDATE kinetiks_approvals SET status = 'expired' WHERE id = 'a1111111-6666-6666-6666-aaaaaaaaaaaa' $$,
  '23514', NULL,
  'flagged → expired is denied (flagged resolves via approved/rejected only)'
);

-- ── denied: pending → invented-status ───────────────────────
INSERT INTO kinetiks_approvals (id, account_id, source_app, action_category, approval_type, title, preview, status, confidence_score)
VALUES ('a1111111-7777-7777-7777-aaaaaaaaaaaa',
        (SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111'),
        'kinetiks_id', 'context_update_minor', 'review', 'invalid target',
        '{"type":"context_edit","content":{}}'::jsonb, 'pending', 95);

-- Invented status fails the CHECK constraint (not the trigger), 23514 either way
SELECT throws_ok(
  $$ UPDATE kinetiks_approvals SET status = 'wat' WHERE id = 'a1111111-7777-7777-7777-aaaaaaaaaaaa' $$,
  '23514', NULL,
  'invalid status value rejected'
);

-- ── approval_class defaults to standard ─────────────────────
SELECT is(
  (SELECT approval_class FROM kinetiks_approvals WHERE id = 'a1111111-0000-0000-0000-aaaaaaaaaaaa'),
  'standard',
  'approval_class defaults to standard'
);

-- ── approval_class CHECK rejects unknown values ─────────────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_approvals (account_id, source_app, action_category, approval_type, title, preview, status, approval_class)
     SELECT id, 'kinetiks_id', 'context_update_minor', 'review', 'bad class', '{"type":"context_edit","content":{}}'::jsonb, 'pending', 'wat'
     FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', NULL,
  'approval_class CHECK rejects unknown values'
);

SELECT * FROM finish();
ROLLBACK;
