-- ============================================================
-- Cross-tenant isolation: kinetiks_budget_allocations
--
-- Read isolation via the parent budget: allocations have no
-- account_id; the RLS policy scopes through budget_id ->
-- kinetiks_budgets.account_id. This proves a user sees only the
-- allocations under their own budgets. The visible row is
-- identified by its category marker.
-- ============================================================

BEGIN;
SELECT plan(2);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user   uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
  alice_budget uuid;
  bob_budget uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'cf-alloc');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-alloc');

  INSERT INTO kinetiks_budgets (account_id, total_budget, period_start, period_end)
  VALUES (alice_account, 1000, now(), now() + interval '30 days') RETURNING id INTO alice_budget;
  INSERT INTO kinetiks_budgets (account_id, total_budget, period_start, period_end)
  VALUES (bob_account, 2000, now(), now() + interval '30 days') RETURNING id INTO bob_budget;

  INSERT INTO kinetiks_budget_allocations (budget_id, category, allocated_amount)
  VALUES (alice_budget, 'alice-alloc', 100),
         (bob_budget,   'bob-alloc',   200);
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_budget_allocations),
  1,
  'budget_allocations: alice sees exactly the allocation under her own budget, not bob''s'
);
SELECT is(
  (SELECT category FROM kinetiks_budget_allocations),
  'alice-alloc',
  'budget_allocations: the only visible allocation is alice''s'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
