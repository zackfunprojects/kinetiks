-- ============================================================
-- Append-only enforcement: kinetiks_ledger (Finding 2.7)
--
-- The Learning Ledger's third enforcement layer (Postgres trigger):
-- UPDATE is never permitted; DELETE is rejected for every path except
-- the guarded account-erasure RPC. Also verifies the event types added
-- in 00070 are accepted and that an unregistered type is still rejected.
--
-- The trigger fires for every role (including service_role, which
-- bypasses RLS), so these assertions run as the default test role.
-- ============================================================

BEGIN;
SELECT plan(7);

DO $$
DECLARE
  u uuid := '33333333-3333-3333-3333-333333333333';
  acct uuid;
BEGIN
  acct := _kt_test_seed_account(u, 'cf-ledger-immutable');
  INSERT INTO kinetiks_ledger (id, account_id, event_type, detail)
  VALUES ('ce111111-0000-0000-0000-000000000001', acct, 'account_created', '{}'::jsonb);
END $$;

-- ── UPDATE is denied: history is immutable ──────────────────
SELECT throws_ok(
  $$ UPDATE kinetiks_ledger SET detail = '{"tampered":true}'::jsonb
     WHERE id = 'ce111111-0000-0000-0000-000000000001' $$,
  '23514', NULL,
  'ledger: UPDATE is rejected by the immutability trigger'
);

-- ── A raw DELETE is denied: no erase flag set ───────────────
SELECT throws_ok(
  $$ DELETE FROM kinetiks_ledger
     WHERE id = 'ce111111-0000-0000-0000-000000000001' $$,
  '23514', NULL,
  'ledger: a raw DELETE is rejected by the immutability trigger'
);

-- ── New approval event type now accepted (00070) ────────────
SELECT lives_ok(
  $$ INSERT INTO kinetiks_ledger (account_id, event_type, detail)
     VALUES ((SELECT id FROM kinetiks_accounts
                WHERE user_id = '33333333-3333-3333-3333-333333333333'),
             'approval_approved', '{}'::jsonb) $$,
  'ledger: approval_approved is now an accepted event type'
);

-- ── New marcus_turn event type now accepted (00070) ─────────
SELECT lives_ok(
  $$ INSERT INTO kinetiks_ledger (account_id, event_type, detail)
     VALUES ((SELECT id FROM kinetiks_accounts
                WHERE user_id = '33333333-3333-3333-3333-333333333333'),
             'marcus_turn', '{}'::jsonb) $$,
  'ledger: marcus_turn is now an accepted event type'
);

-- ── An unregistered event type is still rejected by the CHECK ─
SELECT throws_ok(
  $$ INSERT INTO kinetiks_ledger (account_id, event_type, detail)
     VALUES ((SELECT id FROM kinetiks_accounts
                WHERE user_id = '33333333-3333-3333-3333-333333333333'),
             'definitely_not_a_real_event', '{}'::jsonb) $$,
  '23514', NULL,
  'ledger: an unregistered event_type is rejected by the CHECK'
);

-- ── Guarded erasure is the one path allowed to delete ───────
SELECT lives_ok(
  $$ SELECT kinetiks_erase_account_ledger(
       (SELECT id FROM kinetiks_accounts
          WHERE user_id = '33333333-3333-3333-3333-333333333333')) $$,
  'ledger: kinetiks_erase_account_ledger runs without error'
);
SELECT is(
  (SELECT count(*)::int FROM kinetiks_ledger
     WHERE account_id = (SELECT id FROM kinetiks_accounts
                           WHERE user_id = '33333333-3333-3333-3333-333333333333')),
  0,
  'ledger: erasure removed every row for the account'
);

SELECT * FROM finish();
ROLLBACK;
