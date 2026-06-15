-- ============================================================
-- State machine at the RLS LAYER: kinetiks_goals
--
-- goals_budgets_state_machine.sql validates the transition trigger as a
-- privileged role (RLS bypassed). This suite drives the same machine as an
-- AUTHENTICATED owner, proving RLS and the trigger COMPOSE:
--   1. the owner's legal transition passes RLS and the trigger,
--   2. the owner's illegal transition is still blocked by the trigger
--      (the RLS layer does not weaken the state machine),
--   3. a cross-tenant user's UPDATE is an RLS no-op (0 rows) — they cannot
--      see or mutate another account's goal.
-- Auth carries no account_id claim, so this runs on the resolver's subquery
-- fallback path (matching goals_cross_tenant.sql).
-- ============================================================

BEGIN;
SELECT plan(5);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user   uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'cf-gsm');
  PERFORM _kt_test_seed_account(bob_user, 'bo-gsm');

  INSERT INTO kinetiks_goals (id, account_id, name, type, status) VALUES
    ('c0000001-0000-0000-0000-000000000001', alice_account, 'g-active',   'kpi_target', 'active'),
    ('c0000001-0000-0000-0000-000000000002', alice_account, 'g-archived', 'kpi_target', 'archived');
END $$;

-- ── Owner, under RLS: legal transition passes RLS + trigger ──
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');
SELECT lives_ok(
  $$ UPDATE kinetiks_goals SET status = 'paused' WHERE id = 'c0000001-0000-0000-0000-000000000001' $$,
  'goals(rls): owner active → paused passes RLS and the trigger'
);

-- ── Owner, under RLS: illegal transition still blocked by the trigger ──
SELECT throws_ok(
  $$ UPDATE kinetiks_goals SET status = 'active' WHERE id = 'c0000001-0000-0000-0000-000000000002' $$,
  '23514', NULL,
  'goals(rls): owner archived → active still blocked by the trigger under RLS'
);
SELECT _kt_test_clear_auth();

-- ── Cross-tenant under RLS: bob cannot see or update alice's goal ──
SELECT _kt_test_set_auth_user('22222222-2222-2222-2222-222222222222');
SELECT is(
  (SELECT count(*)::int FROM kinetiks_goals WHERE id = 'c0000001-0000-0000-0000-000000000001'),
  0,
  'goals(rls): cross-tenant user cannot see another account''s goal'
);
SELECT is(
  (WITH u AS (
     UPDATE kinetiks_goals SET status = 'completed'
     WHERE id = 'c0000001-0000-0000-0000-000000000001' RETURNING 1
   ) SELECT count(*)::int FROM u),
  0,
  'goals(rls): cross-tenant UPDATE is an RLS no-op (0 rows affected)'
);
SELECT _kt_test_clear_auth();

-- ── The owner's update stuck; bob's no-op left it untouched ──
SELECT is(
  (SELECT status FROM kinetiks_goals WHERE id = 'c0000001-0000-0000-0000-000000000001'),
  'paused',
  'goals(rls): goal reflects the owner''s transition, untouched by the cross-tenant attempt'
);

SELECT * FROM finish();
ROLLBACK;
