-- ============================================================
-- State machine at the RLS LAYER: kinetiks_budgets
--
-- goals_budgets_state_machine.sql validates the transition trigger as a
-- privileged role. This suite drives the same machine as an AUTHENTICATED
-- owner ("Users manage own budgets" is FOR ALL), proving RLS and the trigger
-- compose: the owner's legal transition passes, the owner's illegal
-- transition is still trigger-blocked, and a cross-tenant user cannot see or
-- mutate another account's budget. Subquery-fallback path.
--
-- (kinetiks_approvals is deliberately NOT covered this way: it is SELECT-only
-- for users — approval decisions transition through the pipeline as the
-- service role, not a direct authenticated UPDATE — so an RLS-layer
-- state-machine test does not apply to it.)
-- ============================================================

BEGIN;
SELECT plan(5);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user   uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'cf-bsm');
  PERFORM _kt_test_seed_account(bob_user, 'bo-bsm');

  INSERT INTO kinetiks_budgets
    (id, account_id, total_budget, period_start, period_end, approval_status)
  VALUES
    ('e0000001-0000-0000-0000-000000000001', alice_account, 1000, now(), now() + interval '30 days', 'draft'),
    ('e0000001-0000-0000-0000-000000000002', alice_account, 1000, now(), now() + interval '30 days', 'closed');
END $$;

-- ── Owner, under RLS: legal transition passes RLS + trigger ──
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');
SELECT lives_ok(
  $$ UPDATE kinetiks_budgets SET approval_status = 'proposed' WHERE id = 'e0000001-0000-0000-0000-000000000001' $$,
  'budgets(rls): owner draft → proposed passes RLS and the trigger'
);

-- ── Owner, under RLS: illegal transition still blocked (closed is terminal) ──
SELECT throws_ok(
  $$ UPDATE kinetiks_budgets SET approval_status = 'active' WHERE id = 'e0000001-0000-0000-0000-000000000002' $$,
  '23514', NULL,
  'budgets(rls): owner closed → active still blocked by the trigger under RLS'
);
SELECT _kt_test_clear_auth();

-- ── Cross-tenant under RLS: bob cannot see or update alice's budget ──
SELECT _kt_test_set_auth_user('22222222-2222-2222-2222-222222222222');
SELECT is(
  (SELECT count(*)::int FROM kinetiks_budgets WHERE id = 'e0000001-0000-0000-0000-000000000001'),
  0,
  'budgets(rls): cross-tenant user cannot see another account''s budget'
);
SELECT is_empty(
  $$ UPDATE kinetiks_budgets SET approval_status = 'approved'
     WHERE id = 'e0000001-0000-0000-0000-000000000001' RETURNING 1 $$,
  'budgets(rls): cross-tenant UPDATE is an RLS no-op (0 rows affected)'
);
SELECT _kt_test_clear_auth();

-- ── The owner's transition stuck; the cross-tenant attempt left it untouched ──
SELECT is(
  (SELECT approval_status FROM kinetiks_budgets WHERE id = 'e0000001-0000-0000-0000-000000000001'),
  'proposed',
  'budgets(rls): budget reflects the owner''s transition, untouched by the cross-tenant attempt'
);

SELECT * FROM finish();
ROLLBACK;
