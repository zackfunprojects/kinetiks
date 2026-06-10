-- ============================================================
-- State-machine triggers: kinetiks_goals + kinetiks_budgets (00073)
--
-- Verifies the DB-layer transition guards: legal status moves succeed,
-- illegal ones (terminal escapes, skipped stages) raise check_violation.
-- The triggers fire for every role, so these run as the default test role.
-- ============================================================

BEGIN;
SELECT plan(11);

DO $$
DECLARE
  u uuid := '44444444-4444-4444-4444-444444444444';
  acct uuid;
BEGIN
  acct := _kt_test_seed_account(u, 'cf-sm');

  -- Goals in known starting states (trigger fires on UPDATE, not INSERT).
  INSERT INTO kinetiks_goals (id, account_id, name, type, status) VALUES
    ('a0000001-0000-0000-0000-000000000001', acct, 'g-active-1', 'kpi_target', 'active'),
    ('a0000001-0000-0000-0000-000000000002', acct, 'g-active-2', 'kpi_target', 'active'),
    ('a0000001-0000-0000-0000-000000000003', acct, 'g-active-3', 'kpi_target', 'active'),
    ('a0000001-0000-0000-0000-000000000004', acct, 'g-archived', 'kpi_target', 'archived'),
    ('a0000001-0000-0000-0000-000000000005', acct, 'g-completed', 'kpi_target', 'completed');

  -- Budgets in known starting states.
  INSERT INTO kinetiks_budgets (id, account_id, total_budget, period_start, period_end, approval_status) VALUES
    ('b0000001-0000-0000-0000-000000000001', acct, 1000, now(), now() + interval '30 days', 'draft'),
    ('b0000001-0000-0000-0000-000000000002', acct, 1000, now(), now() + interval '30 days', 'proposed'),
    ('b0000001-0000-0000-0000-000000000003', acct, 1000, now(), now() + interval '30 days', 'approved'),
    ('b0000001-0000-0000-0000-000000000004', acct, 1000, now(), now() + interval '30 days', 'active'),
    ('b0000001-0000-0000-0000-000000000005', acct, 1000, now(), now() + interval '30 days', 'closed'),
    ('b0000001-0000-0000-0000-000000000006', acct, 1000, now(), now() + interval '30 days', 'draft');
END $$;

-- ── Goals: legal transitions ────────────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_goals SET status = 'paused' WHERE id = 'a0000001-0000-0000-0000-000000000001' $$,
  'goals: active → paused is allowed'
);
SELECT lives_ok(
  $$ UPDATE kinetiks_goals SET status = 'archived' WHERE id = 'a0000001-0000-0000-0000-000000000002' $$,
  'goals: active → archived is allowed'
);
SELECT lives_ok(
  $$ UPDATE kinetiks_goals SET status = 'completed' WHERE id = 'a0000001-0000-0000-0000-000000000003' $$,
  'goals: active → completed is allowed'
);

-- ── Goals: illegal transitions ──────────────────────────────
SELECT throws_ok(
  $$ UPDATE kinetiks_goals SET status = 'active' WHERE id = 'a0000001-0000-0000-0000-000000000004' $$,
  '23514', NULL,
  'goals: archived is terminal — cannot return to active'
);
SELECT throws_ok(
  $$ UPDATE kinetiks_goals SET status = 'paused' WHERE id = 'a0000001-0000-0000-0000-000000000005' $$,
  '23514', NULL,
  'goals: completed → paused is rejected'
);

-- ── Budgets: legal transitions ──────────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_budgets SET approval_status = 'proposed' WHERE id = 'b0000001-0000-0000-0000-000000000001' $$,
  'budgets: draft → proposed is allowed'
);
SELECT lives_ok(
  $$ UPDATE kinetiks_budgets SET approval_status = 'approved' WHERE id = 'b0000001-0000-0000-0000-000000000002' $$,
  'budgets: proposed → approved is allowed'
);
SELECT lives_ok(
  $$ UPDATE kinetiks_budgets SET approval_status = 'active' WHERE id = 'b0000001-0000-0000-0000-000000000003' $$,
  'budgets: approved → active is allowed'
);
SELECT lives_ok(
  $$ UPDATE kinetiks_budgets SET approval_status = 'closed' WHERE id = 'b0000001-0000-0000-0000-000000000004' $$,
  'budgets: active → closed is allowed'
);

-- ── Budgets: illegal transitions ────────────────────────────
SELECT throws_ok(
  $$ UPDATE kinetiks_budgets SET approval_status = 'active' WHERE id = 'b0000001-0000-0000-0000-000000000005' $$,
  '23514', NULL,
  'budgets: closed is terminal — cannot return to active'
);
SELECT throws_ok(
  $$ UPDATE kinetiks_budgets SET approval_status = 'approved' WHERE id = 'b0000001-0000-0000-0000-000000000006' $$,
  '23514', NULL,
  'budgets: draft → approved skips proposed and is rejected'
);

SELECT * FROM finish();
ROLLBACK;
