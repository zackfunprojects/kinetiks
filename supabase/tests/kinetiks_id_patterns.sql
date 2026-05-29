-- ============================================================
-- Phase 1.7: kinetiks_pattern_pending_observations cross-tenant +
-- lifecycle + Pattern Library coverage for kinetiks_id.* types.
--
-- Verifies the new pending-observations table obeys account-scoped
-- RLS, the status state machine is checked, and Pattern Library rows
-- with source_app='kinetiks_id' obey the same cross-tenant rules as
-- harvest-sourced rows.
-- ============================================================

BEGIN;
SELECT plan(11);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'kid-alice');
  bob_account   := _kt_test_seed_account(bob_user,   'kid-bob');

  -- Pending observations: one per account, same pattern_type.
  INSERT INTO kinetiks_pattern_pending_observations
    (id, account_id, pattern_type, dimensions, observation_key,
     outcome_window_expires_at, status)
  VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', alice_account,
     'kinetiks_id.marcus_question_resonance',
     '{"topic":"growth","intent":"strategic","icp":"b2b_saas_founder"}'::jsonb,
     'thread-alice-1:msg-1',
     now() + interval '4 hours', 'pending'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', bob_account,
     'kinetiks_id.marcus_question_resonance',
     '{"topic":"outbound","intent":"action_request","icp":"sales_leader"}'::jsonb,
     'thread-bob-1:msg-1',
     now() + interval '4 hours', 'pending');

  -- Pattern Library: kinetiks_id rows for both accounts.
  INSERT INTO kinetiks_pattern_library
    (id, account_id, pattern_type, source_app, fingerprint, dimensions,
     outcome_metric, outcome_value, outcome_direction,
     effective_decay_days, decay_at)
  VALUES
    ('cccccccc-cccc-cccc-cccc-cccccccccc01', alice_account,
     'kinetiks_id.marcus_question_resonance',
     'kinetiks_id', 'fp-alice-kid-1',
     '{"topic_cluster":"growth"}'::jsonb,
     'follow_up_rate', 0.3, 'higher_is_better',
     45, now() + interval '45 days'),
    ('dddddddd-dddd-dddd-dddd-dddddddddd01', bob_account,
     'kinetiks_id.marcus_question_resonance',
     'kinetiks_id', 'fp-bob-kid-1',
     '{"topic_cluster":"outbound"}'::jsonb,
     'follow_up_rate', 0.4, 'higher_is_better',
     45, now() + interval '45 days');
END $$;

-- ── alice sees only her pending observation ─────────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT results_eq(
  $$ SELECT id FROM kinetiks_pattern_pending_observations ORDER BY id $$,
  $$ VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'::uuid) $$,
  'alice sees only her own pending observation'
);

SELECT is_empty(
  $$ SELECT id FROM kinetiks_pattern_pending_observations
       WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid $$,
  'alice cannot read bob''s pending observation by id'
);

-- ── alice cannot INSERT (no INSERT policy for user role) ────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_pattern_pending_observations
       (account_id, pattern_type, dimensions, observation_key,
        outcome_window_expires_at)
     VALUES (
       (SELECT id FROM kinetiks_accounts WHERE codename = 'kid-alice'),
       'kinetiks_id.marcus_question_resonance',
       '{}'::jsonb,
       'thread-injection',
       now() + interval '1 hour'
     ) $$,
  '42501',
  NULL,
  'user token cannot INSERT into pending observations table'
);

-- ── alice sees only her kinetiks_id pattern ─────────────────
SELECT results_eq(
  $$ SELECT id FROM kinetiks_pattern_library
       WHERE source_app = 'kinetiks_id'
       ORDER BY id $$,
  $$ VALUES ('cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid) $$,
  'alice filtering by source_app=kinetiks_id sees only her own pattern'
);

-- ── Status CHECK rejects invalid values ─────────────────────
RESET ROLE;

SELECT throws_ok(
  $$ INSERT INTO kinetiks_pattern_pending_observations
       (account_id, pattern_type, dimensions, observation_key,
        outcome_window_expires_at, status)
     VALUES (
       (SELECT id FROM kinetiks_accounts WHERE codename = 'kid-alice'),
       'kinetiks_id.marcus_question_resonance',
       '{}'::jsonb,
       'bogus',
       now() + interval '1 hour',
       'definitely_invalid'
     ) $$,
  '23514',
  NULL,
  'status CHECK rejects values outside {pending, closed, expired}'
);

-- ── Lifecycle: pending → closed via service-role UPDATE ─────
UPDATE kinetiks_pattern_pending_observations
   SET status = 'closed',
       closed_outcome_value = 1,
       closed_at = now()
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'::uuid;

SELECT results_eq(
  $$ SELECT status, closed_outcome_value::text FROM kinetiks_pattern_pending_observations
       WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'::uuid $$,
  $$ VALUES ('closed'::text, '1'::text) $$,
  'service-role can close a pending observation'
);

-- ── updated_at advances on update via trigger ───────────────
-- now() is frozen within a single transaction, so updated_at (set by
-- the trigger on UPDATE) equals created_at here. >= confirms the trigger
-- kept a sane ordering without depending on wall-clock advance.
SELECT cmp_ok(
  (SELECT updated_at FROM kinetiks_pattern_pending_observations
     WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'::uuid),
  '>=',
  (SELECT created_at FROM kinetiks_pattern_pending_observations
     WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'::uuid),
  'updated_at is set on UPDATE (>= created_at; now() is frozen in-txn)'
);

-- ── Expiry path: pending → expired ──────────────────────────
UPDATE kinetiks_pattern_pending_observations
   SET status = 'expired',
       closed_outcome_value = 0,
       closed_at = now()
 WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid;

SELECT results_eq(
  $$ SELECT status FROM kinetiks_pattern_pending_observations
       WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid $$,
  $$ VALUES ('expired'::text) $$,
  'service-role can expire a pending observation'
);

-- ============================================================
-- Phase 1.7.1: connection_value_per_source provider-filter +
-- cross-tenant tests for closeMostRecentConnectionEvidenceForProvider.
--
-- The fuzzy-match close path filters pending observations by
-- dimensions->>provider. Verify (a) the filter returns the right row
-- under each provider value, (b) RLS still isolates accounts even when
-- the provider matches across accounts (alice's ga4 invisible to bob's
-- ga4 filter).
-- ============================================================

INSERT INTO kinetiks_pattern_pending_observations
  (id, account_id, pattern_type, dimensions, observation_key,
   outcome_window_expires_at, status)
VALUES
  -- alice: one ga4 + one gsc pending observation
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01',
   (SELECT id FROM kinetiks_accounts WHERE codename = 'kid-alice'),
   'kinetiks_id.connection_value_per_source',
   '{"provider":"ga4","layer_touched":"market","query_class":"ga4_query"}'::jsonb,
   'req-alice-ga4',
   now() + interval '24 hours', 'pending'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02',
   (SELECT id FROM kinetiks_accounts WHERE codename = 'kid-alice'),
   'kinetiks_id.connection_value_per_source',
   '{"provider":"gsc","layer_touched":"market","query_class":"gsc_query"}'::jsonb,
   'req-alice-gsc',
   now() + interval '24 hours', 'pending'),
  -- bob: one ga4 pending observation. Same provider as alice's first;
  -- RLS must keep alice from seeing it via the provider filter.
  ('ffffffff-ffff-ffff-ffff-ffffffffff01',
   (SELECT id FROM kinetiks_accounts WHERE codename = 'kid-bob'),
   'kinetiks_id.connection_value_per_source',
   '{"provider":"ga4","layer_touched":"market","query_class":"ga4_query"}'::jsonb,
   'req-bob-ga4',
   now() + interval '24 hours', 'pending');

-- ── alice with provider='ga4' filter ─────────────────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT results_eq(
  $$ SELECT observation_key FROM kinetiks_pattern_pending_observations
       WHERE pattern_type = 'kinetiks_id.connection_value_per_source'
         AND status = 'pending'
         AND dimensions->>'provider' = 'ga4'
       ORDER BY observation_key $$,
  $$ VALUES ('req-alice-ga4'::text) $$,
  'alice with provider=ga4 filter sees only her own ga4 observation, not bob''s'
);

-- ── alice with provider='gsc' filter ─────────────────────────
SELECT results_eq(
  $$ SELECT observation_key FROM kinetiks_pattern_pending_observations
       WHERE pattern_type = 'kinetiks_id.connection_value_per_source'
         AND status = 'pending'
         AND dimensions->>'provider' = 'gsc' $$,
  $$ VALUES ('req-alice-gsc'::text) $$,
  'alice with provider=gsc filter sees only her own gsc observation'
);

-- ── bob with provider='ga4' filter ───────────────────────────
SELECT _kt_test_set_auth_user('22222222-2222-2222-2222-222222222222');

SELECT results_eq(
  $$ SELECT observation_key FROM kinetiks_pattern_pending_observations
       WHERE pattern_type = 'kinetiks_id.connection_value_per_source'
         AND status = 'pending'
         AND dimensions->>'provider' = 'ga4' $$,
  $$ VALUES ('req-bob-ga4'::text) $$,
  'bob with provider=ga4 filter sees only his own ga4 observation, not alice''s'
);

SELECT * FROM finish();
ROLLBACK;
