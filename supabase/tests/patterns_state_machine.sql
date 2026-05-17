-- ============================================================
-- State-machine enforcement: kinetiks_pattern_library
--
-- Validates the L1a trigger in 00040_kinetiks_pattern_library.sql:
--   emerging  → validated | archived
--   validated → declining | archived
--   declining → validated | archived
--   archived  → (terminal; backward transitions denied)
--
-- Timestamps stamped automatically on entry to validated / declining /
-- archived states.
-- ============================================================

BEGIN;
SELECT plan(12);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  alice_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-pat-sm');
  INSERT INTO kinetiks_pattern_library
    (id, account_id, pattern_type, emitting_app, fingerprint, dimensions,
     effective_decay_days, decay_at, status)
  VALUES
    ('c1111111-0000-0000-0000-aaaaaaaaaaaa', alice_account, 'harvest.outreach_angle_performance', 'harvest',
     'fp-sm-emerging-1',  '{"a":1}'::jsonb, 30, now() + interval '30 days', 'emerging'),
    ('c1111111-0000-0000-0000-bbbbbbbbbbbb', alice_account, 'harvest.outreach_angle_performance', 'harvest',
     'fp-sm-validated-1', '{"a":2}'::jsonb, 30, now() + interval '30 days', 'validated'),
    ('c1111111-0000-0000-0000-cccccccccccc', alice_account, 'harvest.outreach_angle_performance', 'harvest',
     'fp-sm-declining-1', '{"a":3}'::jsonb, 30, now() + interval '30 days', 'declining'),
    ('c1111111-0000-0000-0000-dddddddddddd', alice_account, 'harvest.outreach_angle_performance', 'harvest',
     'fp-sm-archived-1',  '{"a":4}'::jsonb, 30, now() + interval '30 days', 'archived'),
    ('c1111111-0000-0000-0000-eeeeeeeeeeee', alice_account, 'harvest.outreach_angle_performance', 'harvest',
     'fp-sm-archive-from-emerging', '{"a":5}'::jsonb, 30, now() + interval '30 days', 'emerging');
END $$;

-- ── allowed: emerging → validated ───────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_pattern_library SET status = 'validated' WHERE id = 'c1111111-0000-0000-0000-aaaaaaaaaaaa' $$,
  'emerging → validated is allowed'
);

SELECT isnt(
  (SELECT validated_at FROM kinetiks_pattern_library WHERE id = 'c1111111-0000-0000-0000-aaaaaaaaaaaa'),
  NULL,
  'validated_at is stamped automatically on the transition'
);

-- ── allowed: validated → declining ──────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_pattern_library SET status = 'declining' WHERE id = 'c1111111-0000-0000-0000-bbbbbbbbbbbb' $$,
  'validated → declining is allowed'
);

SELECT isnt(
  (SELECT declining_at FROM kinetiks_pattern_library WHERE id = 'c1111111-0000-0000-0000-bbbbbbbbbbbb'),
  NULL,
  'declining_at is stamped automatically on the transition'
);

-- ── allowed: declining → validated (re-validation) ──────────
SELECT lives_ok(
  $$ UPDATE kinetiks_pattern_library SET status = 'validated' WHERE id = 'c1111111-0000-0000-0000-cccccccccccc' $$,
  'declining → validated (re-validation) is allowed'
);

-- ── allowed: emerging → archived ────────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_pattern_library SET status = 'archived' WHERE id = 'c1111111-0000-0000-0000-eeeeeeeeeeee' $$,
  'emerging → archived is allowed (customer archive or ICP removal)'
);

SELECT isnt(
  (SELECT archived_at FROM kinetiks_pattern_library WHERE id = 'c1111111-0000-0000-0000-eeeeeeeeeeee'),
  NULL,
  'archived_at is stamped automatically on the transition'
);

-- ── denied: archived → anything (terminal) ──────────────────
SELECT throws_ok(
  $$ UPDATE kinetiks_pattern_library SET status = 'validated' WHERE id = 'c1111111-0000-0000-0000-dddddddddddd' $$,
  '23514', NULL,
  'archived is terminal — cannot transition back to validated'
);

SELECT throws_ok(
  $$ UPDATE kinetiks_pattern_library SET status = 'emerging' WHERE id = 'c1111111-0000-0000-0000-dddddddddddd' $$,
  '23514', NULL,
  'archived is terminal — cannot transition back to emerging'
);

-- ── denied: skip transitions (e.g., emerging → declining) ───
DO $$
DECLARE
  alice_account uuid := (SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111');
BEGIN
  INSERT INTO kinetiks_pattern_library
    (id, account_id, pattern_type, emitting_app, fingerprint, dimensions,
     effective_decay_days, decay_at, status)
  VALUES
    ('c1111111-1111-1111-1111-aaaaaaaaaaaa', alice_account, 'harvest.outreach_angle_performance', 'harvest',
     'fp-sm-skip-1', '{"a":6}'::jsonb, 30, now() + interval '30 days', 'emerging');
END $$;

SELECT throws_ok(
  $$ UPDATE kinetiks_pattern_library SET status = 'declining' WHERE id = 'c1111111-1111-1111-1111-aaaaaaaaaaaa' $$,
  '23514', NULL,
  'emerging → declining is denied (must validate first)'
);

-- ── denied: validated → emerging (backward) ─────────────────
DO $$
DECLARE
  alice_account uuid := (SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111');
BEGIN
  INSERT INTO kinetiks_pattern_library
    (id, account_id, pattern_type, emitting_app, fingerprint, dimensions,
     effective_decay_days, decay_at, status)
  VALUES
    ('c1111111-2222-2222-2222-aaaaaaaaaaaa', alice_account, 'harvest.outreach_angle_performance', 'harvest',
     'fp-sm-backward-1', '{"a":7}'::jsonb, 30, now() + interval '30 days', 'validated');
END $$;

SELECT throws_ok(
  $$ UPDATE kinetiks_pattern_library SET status = 'emerging' WHERE id = 'c1111111-2222-2222-2222-aaaaaaaaaaaa' $$,
  '23514', NULL,
  'validated → emerging is denied (backward transition forbidden)'
);

-- ── allowed: declining → archived ───────────────────────────
DO $$
DECLARE
  alice_account uuid := (SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111');
BEGIN
  INSERT INTO kinetiks_pattern_library
    (id, account_id, pattern_type, emitting_app, fingerprint, dimensions,
     effective_decay_days, decay_at, status)
  VALUES
    ('c1111111-3333-3333-3333-aaaaaaaaaaaa', alice_account, 'harvest.outreach_angle_performance', 'harvest',
     'fp-sm-decline-to-archive', '{"a":8}'::jsonb, 30, now() + interval '30 days', 'declining');
END $$;

SELECT lives_ok(
  $$ UPDATE kinetiks_pattern_library SET status = 'archived' WHERE id = 'c1111111-3333-3333-3333-aaaaaaaaaaaa' $$,
  'declining → archived is allowed (time-decay sweep result)'
);

SELECT * FROM finish();
ROLLBACK;
