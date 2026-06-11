-- ============================================================
-- kinetiks_inbound_events — service-role-only posture (D3).
--
-- The inbound claim table carries no user policies by design:
-- authenticated users must see and write NOTHING (default deny).
-- The UNIQUE(event_key) claim semantics get a positive assertion
-- too — duplicate claims lose with 23505.
-- ============================================================

BEGIN;
SELECT plan(4);

DO $$
DECLARE
  dana_user uuid := '34444444-4444-4444-4444-444444444444';
  dana_account uuid;
BEGIN
  dana_account := _kt_test_seed_account(dana_user, 'se-dana');
  PERFORM set_config('test.dana_account', dana_account::text, true);

  INSERT INTO kinetiks_inbound_events (account_id, source, event_key, event_type)
  VALUES (dana_account, 'slack', 'T0TEAM:Ev0001', 'app_mention');
END $$;

-- Claim semantics (as service role): duplicates lose.
SELECT throws_ok(
  $$ INSERT INTO kinetiks_inbound_events (account_id, source, event_key, event_type)
     VALUES (current_setting('test.dana_account')::uuid, 'slack', 'T0TEAM:Ev0001', 'app_mention') $$,
  '23505',
  NULL,
  'inbound_events: a duplicate event_key claim is rejected'
);

-- Authenticated users: default deny on read and write.
SELECT _kt_test_set_auth_user('34444444-4444-4444-4444-444444444444');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_inbound_events),
  0,
  'inbound_events: authenticated users see no claim rows (no SELECT policy)'
);
SELECT throws_ok(
  $$ INSERT INTO kinetiks_inbound_events (account_id, source, event_key, event_type)
     VALUES (current_setting('test.dana_account')::uuid, 'slack', 'T0TEAM:Ev0002', 'app_mention') $$,
  '42501',
  NULL,
  'inbound_events: authenticated users cannot insert claims'
);
SELECT lives_ok(
  $$ DELETE FROM kinetiks_inbound_events WHERE event_key = 'T0TEAM:Ev0001' $$,
  'inbound_events: a user DELETE executes but matches zero rows under RLS'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
