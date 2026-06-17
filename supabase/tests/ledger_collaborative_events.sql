-- ============================================================
-- Ledger event-type CHECK: collaborative events (00087)
--
-- The kill + intervention signals are kinetiks_ledger entries, not a new table
-- (plan D5). 00087 added task_killed / intervention_undo / intervention_grab to
-- the event_type CHECK. The constraint is NOT VALID (historical rows
-- grandfathered) but every NEW insert is still validated, so this suite proves
-- the three collaborative types are accepted and an unregistered type is
-- rejected — the contract that keeps a typo'd signal out of the Ledger.
--
-- Runs as postgres: exercises the CHECK constraint + immutable guard, not RLS
-- (writes are service-role only in production).
-- ============================================================

BEGIN;
SELECT plan(4);

DO $$
DECLARE
  u uuid := '44444444-4444-4444-4444-444444444444';
BEGIN
  PERFORM _kt_test_seed_account(u, 'teal-lynx-ledger');
END $$;

-- ── the three collaborative event types are accepted ────────
SELECT lives_ok(
  $$ INSERT INTO kinetiks_ledger (account_id, event_type, detail, source_app)
     VALUES ((SELECT id FROM kinetiks_accounts WHERE codename = 'teal-lynx-ledger'),
             'task_killed',
             '{"weight": 2, "reason_code": "wrong_tone", "is_fixture": true}'::jsonb,
             'kinetiks_fixtures') $$,
  'task_killed is an accepted ledger event type (2x kill signal, §8.3)'
);
SELECT lives_ok(
  $$ INSERT INTO kinetiks_ledger (account_id, event_type, detail, source_app)
     VALUES ((SELECT id FROM kinetiks_accounts WHERE codename = 'teal-lynx-ledger'),
             'intervention_undo',
             '{"is_fixture": true}'::jsonb,
             'kinetiks_fixtures') $$,
  'intervention_undo is an accepted ledger event type (weak reject, §9.3)'
);
SELECT lives_ok(
  $$ INSERT INTO kinetiks_ledger (account_id, event_type, detail, source_app)
     VALUES ((SELECT id FROM kinetiks_accounts WHERE codename = 'teal-lynx-ledger'),
             'intervention_grab',
             '{"field_name": "subject_line", "is_fixture": true}'::jsonb,
             'kinetiks_fixtures') $$,
  'intervention_grab is an accepted ledger event type (field-level penalty, §9.3)'
);

-- ── an unregistered event type is rejected ──────────────────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_ledger (account_id, event_type, detail)
     VALUES ((SELECT id FROM kinetiks_accounts WHERE codename = 'teal-lynx-ledger'),
             'task_yeeted', '{}'::jsonb) $$,
  '23514', NULL,
  'an unregistered collaborative event type is rejected by the CHECK'
);

SELECT * FROM finish();
ROLLBACK;
