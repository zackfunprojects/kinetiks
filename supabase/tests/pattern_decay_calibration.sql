-- ============================================================
-- Phase 2: Empirical Decay Calibration cross-tenant + write-path
-- invariants for kinetiks_pattern_library.
--
-- Invariants verified:
--   1. Cross-account read isolation holds for effective_decay_days and
--      decay_at (the columns Phase 2 mutates).
--   2. User-token UPDATE of effective_decay_days runs with zero rows
--      affected (no UPDATE policy declared on the table).
--   3. Service-role UPDATE + pattern_decay_calibrated Ledger INSERT is
--      the only legal calibration path. The CHECK constraint on
--      kinetiks_ledger.event_type accepts pattern_decay_calibrated.
--   4. CHECK constraint denies an unregistered event_type variant
--      (defense against accidental cross-spec drift).
-- ============================================================

BEGIN;
SELECT plan(13);

-- ── Arrange: two seeded accounts + service-role-inserted patterns ──
DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111122';
  bob_user uuid := '22222222-2222-2222-2222-222222222233';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'amber-fox-cal');
  bob_account   := _kt_test_seed_account(bob_user,   'silver-otter-cal');

  -- Insert one pattern per account as the postgres role (mimics
  -- service-role Archivist writes; user tokens cannot do this).
  INSERT INTO kinetiks_pattern_library
    (id, account_id, pattern_type, source_app, fingerprint, dimensions,
     outcome_metric, outcome_value, outcome_direction,
     observation_count, sample_size, variance,
     effective_decay_days, decay_at, status)
  VALUES
    ('cccccccc-cccc-cccc-cccc-cccccccccc01', alice_account,
     'harvest.outreach_angle_performance.reply_rate',
     'harvest', 'fp-alice-cal', '{"a":1}'::jsonb,
     'reply_rate', 0.14, 'higher_is_better',
     40, 200, 0.0005,
     60, now() + interval '55 days', 'validated'),
    ('dddddddd-dddd-dddd-dddd-dddddddddd02', bob_account,
     'harvest.outreach_angle_performance.reply_rate',
     'harvest', 'fp-bob-cal',   '{"a":2}'::jsonb,
     'reply_rate', 0.12, 'higher_is_better',
     40, 200, 0.05,
     60, now() + interval '55 days', 'validated');
END $$;

-- ────────────────────────────────────────────────────────────
-- Cross-account isolation: alice cannot read bob's effective_decay_days
-- ────────────────────────────────────────────────────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111122');

SELECT is_empty(
  $$ SELECT effective_decay_days
       FROM kinetiks_pattern_library
       WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddd02'::uuid $$,
  'alice cannot read bob''s effective_decay_days'
);

SELECT results_eq(
  $$ SELECT effective_decay_days
       FROM kinetiks_pattern_library
       WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid $$,
  $$ VALUES (60) $$,
  'alice sees her own effective_decay_days'
);

-- ────────────────────────────────────────────────────────────
-- User token cannot UPDATE effective_decay_days (no UPDATE policy)
-- ────────────────────────────────────────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_pattern_library
       SET effective_decay_days = 999
       WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddd02'::uuid $$,
  'alice''s UPDATE on bob''s pattern runs without throwing (RLS filters target rows)'
);

SELECT lives_ok(
  $$ UPDATE kinetiks_pattern_library
       SET effective_decay_days = 999
       WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid $$,
  'alice''s UPDATE on her own pattern runs without throwing (no UPDATE policy)'
);

SELECT _kt_test_clear_auth();

SELECT is(
  (SELECT effective_decay_days
     FROM kinetiks_pattern_library
     WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddd02'::uuid),
  60,
  'bob''s pattern effective_decay_days unchanged after alice''s UPDATE attempt'
);

SELECT is(
  (SELECT effective_decay_days
     FROM kinetiks_pattern_library
     WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid),
  60,
  'alice''s own pattern effective_decay_days unchanged via user token (no UPDATE policy)'
);

-- ────────────────────────────────────────────────────────────
-- Service-role: pattern_decay_calibrated Ledger INSERT is allowed by
-- the CHECK constraint (postgres role bypasses RLS).
-- ────────────────────────────────────────────────────────────
SELECT lives_ok(
  $$ INSERT INTO kinetiks_ledger (account_id, event_type, source_app,
       source_operator, target_layer, detail)
     SELECT id, 'pattern_decay_calibrated', 'kinetiks_id', 'archivist',
            NULL,
            jsonb_build_object(
              'pattern_id',                       'cccccccc-cccc-cccc-cccc-cccccccccc01',
              'pattern_type',                     'harvest.outreach_angle_performance.reply_rate',
              'prior_effective_decay_days',       60,
              'next_effective_decay_days',        66,
              'prior_decay_at',                   (now() + interval '55 days')::text,
              'next_decay_at',                    (now() + interval '61 days')::text,
              'observed_variance',                0.0005,
              'observation_count',                40,
              'declining_transitions_in_window',  0,
              'decision',                         'extend',
              'rationale',                        'test')
       FROM kinetiks_accounts
      WHERE codename = 'amber-fox-cal' $$,
  'service-role can write pattern_decay_calibrated Ledger entry (CHECK passes)'
);

-- ────────────────────────────────────────────────────────────
-- CHECK constraint denies an unregistered event type variant.
-- ────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_ledger (account_id, event_type, source_app,
       source_operator, target_layer, detail)
     SELECT id, 'pattern_decay_NOT_A_REAL_EVENT_TYPE', 'kinetiks_id',
            'archivist', NULL, '{}'::jsonb
       FROM kinetiks_accounts
      WHERE codename = 'amber-fox-cal' $$,
  '23514',
  NULL,
  'CHECK constraint rejects unregistered event_type variants'
);

-- ────────────────────────────────────────────────────────────
-- _kt_apply_pattern_decay_calibration RPC: atomic UPDATE + Ledger
-- ────────────────────────────────────────────────────────────

-- Happy path: CAS matches → UPDATE applies + Ledger row lands.
DO $$
DECLARE
  v_prior_updated_at timestamptz;
  v_result jsonb;
  v_alice_account uuid;
BEGIN
  SELECT id INTO v_alice_account
    FROM kinetiks_accounts WHERE codename = 'amber-fox-cal';
  SELECT updated_at INTO v_prior_updated_at
    FROM kinetiks_pattern_library
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid;

  SELECT _kt_apply_pattern_decay_calibration(
    v_alice_account,
    'cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid,
    60,                                    -- prior_effective_decay_days
    v_prior_updated_at,                    -- prior_updated_at (matches)
    66,                                    -- next_effective_decay_days
    (now() + interval '61 days')::timestamptz,
    jsonb_build_object(
      'pattern_id',                       'cccccccc-cccc-cccc-cccc-cccccccccc01',
      'pattern_type',                     'harvest.outreach_angle_performance.reply_rate',
      'prior_effective_decay_days',       60,
      'next_effective_decay_days',        66,
      'prior_decay_at',                   (now() + interval '55 days')::text,
      'next_decay_at',                    (now() + interval '61 days')::text,
      'observed_variance',                0.0005,
      'observation_count',                40,
      'declining_transitions_in_window',  0,
      'decision',                         'extend',
      'rationale',                        'pgtap: cas match')
  ) INTO v_result;

  PERFORM set_config('test.rpc_happy_result', v_result::text, true);
END $$;

SELECT is(
  current_setting('test.rpc_happy_result')::jsonb,
  '{"applied": true}'::jsonb,
  'RPC reports applied=true on CAS match'
);

SELECT is(
  (SELECT effective_decay_days FROM kinetiks_pattern_library
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid),
  66,
  'happy-path RPC updated effective_decay_days on alice''s pattern'
);

SELECT is(
  (SELECT count(*)::int FROM kinetiks_ledger
    WHERE event_type = 'pattern_decay_calibrated'
      AND detail->>'pattern_id' = 'cccccccc-cccc-cccc-cccc-cccccccccc01'
      AND detail->>'rationale' = 'pgtap: cas match'),
  1,
  'happy-path RPC wrote exactly one pattern_decay_calibrated Ledger row'
);

-- CAS failure: prior_effective_decay_days no longer matches → no
-- UPDATE, no Ledger row, applied=false.
DO $$
DECLARE
  v_prior_updated_at timestamptz;
  v_result jsonb;
  v_bob_account uuid;
  v_ledger_before int;
  v_ledger_after int;
BEGIN
  SELECT id INTO v_bob_account
    FROM kinetiks_accounts WHERE codename = 'silver-otter-cal';
  SELECT updated_at INTO v_prior_updated_at
    FROM kinetiks_pattern_library
    WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddd02'::uuid;
  SELECT count(*)::int INTO v_ledger_before
    FROM kinetiks_ledger
    WHERE event_type = 'pattern_decay_calibrated'
      AND detail->>'pattern_id' = 'dddddddd-dddd-dddd-dddd-dddddddddd02';

  SELECT _kt_apply_pattern_decay_calibration(
    v_bob_account,
    'dddddddd-dddd-dddd-dddd-dddddddddd02'::uuid,
    99,                                    -- prior_effective_decay_days WRONG (actual is 60)
    v_prior_updated_at,
    54,
    (now() + interval '49 days')::timestamptz,
    jsonb_build_object('pattern_id', 'dddddddd-dddd-dddd-dddd-dddddddddd02',
                       'rationale',  'pgtap: cas mismatch — must not apply')
  ) INTO v_result;

  SELECT count(*)::int INTO v_ledger_after
    FROM kinetiks_ledger
    WHERE event_type = 'pattern_decay_calibrated'
      AND detail->>'pattern_id' = 'dddddddd-dddd-dddd-dddd-dddddddddd02';

  PERFORM set_config('test.rpc_cas_result',      v_result::text,       true);
  PERFORM set_config('test.rpc_cas_ledger_diff', (v_ledger_after - v_ledger_before)::text, true);
END $$;

SELECT is(
  current_setting('test.rpc_cas_result')::jsonb,
  '{"applied": false}'::jsonb,
  'RPC reports applied=false when prior_effective_decay_days mismatches'
);

SELECT is(
  (SELECT effective_decay_days FROM kinetiks_pattern_library
    WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddd02'::uuid),
  60,
  'CAS-mismatch RPC left bob''s effective_decay_days untouched'
);

SELECT is(
  current_setting('test.rpc_cas_ledger_diff')::int,
  0,
  'CAS-mismatch RPC did NOT write a Ledger entry'
);

SELECT * FROM finish();
ROLLBACK;
