-- ============================================================
-- State machine: kinetiks_active_tasks (trigger backstop, 00090)
--
-- Legal:   active <-> paused ; active|paused -> killed|completed
-- Terminal: killed, completed (no transition out)
-- Invariant: one active/paused task per (account, thread)
-- Plus: terminal entry auto-stamps ended_at.
--
-- Runs as the default (postgres) role: this exercises the trigger +
-- constraints, not RLS.
-- ============================================================

BEGIN;
SELECT plan(8);

DO $$
DECLARE
  u uuid := '33333333-3333-3333-3333-333333333333';
  acct uuid;
BEGIN
  acct := _kt_test_seed_account(u, 'teal-lynx-task');
  INSERT INTO kinetiks_active_tasks (id, account_id, thread_id, name, app_name, status)
  VALUES
    ('a0000000-0000-0000-0000-00000000a001', acct, 'thr-1', 'Task one', 'harvest', 'active'),
    ('a0000000-0000-0000-0000-00000000a002', acct, 'thr-2', 'Task two', 'dm', 'active');
END $$;

-- ── one active/paused task per thread ───────────────────────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_active_tasks (account_id, thread_id, name, app_name)
     VALUES ((SELECT id FROM kinetiks_accounts WHERE codename = 'teal-lynx-task'),
             'thr-1', 'dup', 'harvest') $$,
  '23505', NULL,
  'a second active task in the same thread is rejected (one per thread)'
);

-- ── legal transitions on task one ───────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_active_tasks SET status = 'paused' WHERE id = 'a0000000-0000-0000-0000-00000000a001' $$,
  'active -> paused is legal'
);
SELECT lives_ok(
  $$ UPDATE kinetiks_active_tasks SET status = 'active' WHERE id = 'a0000000-0000-0000-0000-00000000a001' $$,
  'paused -> active is legal'
);
SELECT lives_ok(
  $$ UPDATE kinetiks_active_tasks SET status = 'completed' WHERE id = 'a0000000-0000-0000-0000-00000000a001' $$,
  'active -> completed is legal'
);
SELECT isnt(
  (SELECT ended_at FROM kinetiks_active_tasks WHERE id = 'a0000000-0000-0000-0000-00000000a001'),
  NULL,
  'ended_at is auto-stamped on completion'
);

-- ── terminal is one-way ─────────────────────────────────────
SELECT throws_ok(
  $$ UPDATE kinetiks_active_tasks SET status = 'active' WHERE id = 'a0000000-0000-0000-0000-00000000a001' $$,
  '23514', NULL,
  'completed is terminal: completed -> active is denied'
);

-- ── kill transition stamps ended_at ─────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_active_tasks SET status = 'killed', kill_reason_code = 'wrong_tone'
     WHERE id = 'a0000000-0000-0000-0000-00000000a002' $$,
  'active -> killed is legal'
);
SELECT isnt(
  (SELECT ended_at FROM kinetiks_active_tasks WHERE id = 'a0000000-0000-0000-0000-00000000a002'),
  NULL,
  'ended_at is auto-stamped on kill'
);

SELECT * FROM finish();
ROLLBACK;
