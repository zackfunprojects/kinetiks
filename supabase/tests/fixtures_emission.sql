-- ============================================================
-- Phase 1.5 fixture substrate: cross-tenant + CHECK + cleanup
--
-- Verifies that fixture-sourced patterns (source_app =
-- 'kinetiks_fixtures') obey the same RLS isolation as real
-- Harvest-sourced patterns, that the cleanup query archives only
-- fixture-sourced rows, and that the 00044 CHECK extension accepts
-- the two new Ledger event types.
-- ============================================================

BEGIN;
SELECT plan(8);

-- ── Arrange: two accounts, mixed fixture + real patterns ─────
DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'fixture-alice');
  bob_account   := _kt_test_seed_account(bob_user,   'fixture-bob');

  INSERT INTO kinetiks_pattern_library
    (id, account_id, pattern_type, source_app, fingerprint, dimensions,
     outcome_metric, outcome_value, outcome_direction,
     effective_decay_days, decay_at, status)
  VALUES
    -- alice: one fixture, one real
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', alice_account,
     'harvest.outreach_angle_performance.reply_rate',
     'kinetiks_fixtures', 'fp-alice-fixture-1',
     '{"angle_kind":"value_prop"}'::jsonb,
     'reply_rate', 0.07, 'higher_is_better',
     60, now() + interval '60 days', 'emerging'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', alice_account,
     'harvest.outreach_angle_performance.reply_rate',
     'harvest', 'fp-alice-real-1',
     '{"angle_kind":"value_prop"}'::jsonb,
     'reply_rate', 0.09, 'higher_is_better',
     60, now() + interval '60 days', 'validated'),
    -- bob: one fixture
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', bob_account,
     'harvest.outreach_angle_performance.reply_rate',
     'kinetiks_fixtures', 'fp-bob-fixture-1',
     '{"angle_kind":"data_point"}'::jsonb,
     'reply_rate', 0.05, 'higher_is_better',
     60, now() + interval '60 days', 'emerging');
END $$;

-- ── alice sees only her own rows (fixture AND real) ─────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT results_eq(
  $$ SELECT id FROM kinetiks_pattern_library ORDER BY id $$,
  $$ VALUES
       ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'::uuid),
       ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02'::uuid)
  $$,
  'alice sees both her fixture and her real pattern, not bob''s'
);

SELECT is_empty(
  $$ SELECT id FROM kinetiks_pattern_library
       WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid $$,
  'alice cannot read bob''s fixture pattern'
);

-- ── source_app filter scoped per account works for fixtures ──
SELECT results_eq(
  $$ SELECT id FROM kinetiks_pattern_library
       WHERE source_app = 'kinetiks_fixtures' $$,
  $$ VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'::uuid) $$,
  'alice filtering by source_app=kinetiks_fixtures sees only her fixture row'
);

-- ── Cleanup-equivalent query archives only fixture rows ─────
-- Switch to postgres role (service-role-like) since the cleanup
-- endpoint runs under admin auth.
RESET ROLE;

UPDATE kinetiks_pattern_library
   SET status = 'archived'
 WHERE source_app = 'kinetiks_fixtures'
   AND status != 'archived';

SELECT results_eq(
  $$ SELECT status FROM kinetiks_pattern_library
       WHERE id IN (
         'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'::uuid,
         'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid
       )
       ORDER BY id $$,
  $$ VALUES ('archived'::text), ('archived'::text) $$,
  'cleanup archives both fixture rows (alice + bob)'
);

SELECT results_eq(
  $$ SELECT status FROM kinetiks_pattern_library
       WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02'::uuid $$,
  $$ VALUES ('validated'::text) $$,
  'cleanup leaves alice''s real Harvest pattern untouched'
);

-- ── CHECK constraint accepts fixture_emission / fixture_cleanup ──
SELECT lives_ok(
  $$ INSERT INTO kinetiks_ledger
       (account_id, event_type, source_app, source_operator, detail)
     VALUES (
       (SELECT id FROM kinetiks_accounts WHERE codename = 'fixture-alice'),
       'fixture_emission',
       'kinetiks_fixtures',
       'fixture_emitter',
       '{"pattern_type":"harvest.outreach_angle_performance.reply_rate",
         "pattern_id":null,
         "outcome":"created_emerging",
         "outcome_metric":"reply_rate",
         "outcome_value":0.07,
         "sample_size":32,
         "is_fixture":true}'::jsonb
     ) $$,
  'fixture_emission event_type passes the CHECK constraint'
);

SELECT lives_ok(
  $$ INSERT INTO kinetiks_ledger
       (account_id, event_type, source_app, source_operator, detail)
     VALUES (
       (SELECT id FROM kinetiks_accounts WHERE codename = 'fixture-alice'),
       'fixture_cleanup',
       'kinetiks_fixtures',
       'fixture_emitter',
       '{"archived_count":1,"is_fixture":true}'::jsonb
     ) $$,
  'fixture_cleanup event_type passes the CHECK constraint'
);

-- ── CHECK rejects an unregistered event type ────────────────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_ledger
       (account_id, event_type, source_app, source_operator, detail)
     VALUES (
       (SELECT id FROM kinetiks_accounts WHERE codename = 'fixture-alice'),
       'fixture_definitely_not_a_real_type',
       'kinetiks_fixtures',
       'fixture_emitter',
       '{"is_fixture":true}'::jsonb
     ) $$,
  '23514',
  NULL,
  'CHECK rejects an unregistered fixture-shaped event_type'
);

SELECT * FROM finish();
ROLLBACK;
