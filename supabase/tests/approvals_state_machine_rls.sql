-- ============================================================
-- State machine at the RLS LAYER: kinetiks_approvals
--
-- approvals_state_machine.sql validates the transition trigger as a
-- privileged role. This suite drives the same machine as an AUTHENTICATED
-- owner, proving RLS and the trigger compose: the owner's legal decision
-- passes, the owner's illegal transition is still trigger-blocked, and a
-- cross-tenant user cannot see or mutate another account's approval.
-- Subquery-fallback path (no account_id claim).
--
-- The approval membrane is the most safety-critical system; an RLS hole here
-- would let one tenant decide another tenant's actions.
-- ============================================================

BEGIN;
SELECT plan(5);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user   uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'cf-asm');
  PERFORM _kt_test_seed_account(bob_user, 'bo-asm');

  INSERT INTO kinetiks_approvals
    (id, account_id, source_app, action_category, approval_type, title, preview, status, confidence_score)
  VALUES
    ('d1111111-0000-0000-0000-000000000001', alice_account, 'kinetiks_id', 'context_update_minor', 'review', 'pending row',  '{"type":"context_edit","content":{}}'::jsonb, 'pending',  95),
    ('d1111111-0000-0000-0000-000000000002', alice_account, 'kinetiks_id', 'context_update_minor', 'review', 'approved row', '{"type":"context_edit","content":{}}'::jsonb, 'approved', 95);
END $$;

-- ── Owner, under RLS: legal decision passes RLS + trigger ──
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');
SELECT lives_ok(
  $$ UPDATE kinetiks_approvals SET status = 'approved' WHERE id = 'd1111111-0000-0000-0000-000000000001' $$,
  'approvals(rls): owner pending → approved passes RLS and the trigger'
);

-- ── Owner, under RLS: illegal transition still blocked (approved is terminal) ──
SELECT throws_ok(
  $$ UPDATE kinetiks_approvals SET status = 'rejected' WHERE id = 'd1111111-0000-0000-0000-000000000002' $$,
  '23514', NULL,
  'approvals(rls): owner approved → rejected still blocked by the trigger under RLS'
);
SELECT _kt_test_clear_auth();

-- ── Cross-tenant under RLS: bob cannot see or decide alice's approval ──
SELECT _kt_test_set_auth_user('22222222-2222-2222-2222-222222222222');
SELECT is(
  (SELECT count(*)::int FROM kinetiks_approvals WHERE id = 'd1111111-0000-0000-0000-000000000001'),
  0,
  'approvals(rls): cross-tenant user cannot see another account''s approval'
);
SELECT is(
  (WITH u AS (
     UPDATE kinetiks_approvals SET status = 'rejected'
     WHERE id = 'd1111111-0000-0000-0000-000000000001' RETURNING 1
   ) SELECT count(*)::int FROM u),
  0,
  'approvals(rls): cross-tenant decision is an RLS no-op (0 rows affected)'
);
SELECT _kt_test_clear_auth();

-- ── The owner's approval stuck; the cross-tenant attempt left it untouched ──
SELECT is(
  (SELECT status FROM kinetiks_approvals WHERE id = 'd1111111-0000-0000-0000-000000000001'),
  'approved',
  'approvals(rls): approval reflects the owner''s decision, untouched by the cross-tenant attempt'
);

SELECT * FROM finish();
ROLLBACK;
