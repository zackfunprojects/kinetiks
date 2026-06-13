-- ============================================================
-- kinetiks_model_assignments + kinetiks_model_flip_proposals
-- (adaptive model selection).
--
-- Platform-level config, NOT account-scoped: model choice is one
-- deployment-wide engineering decision. Both tables are service-role
-- plumbing — RLS enabled with NO user policies (default deny, the same
-- posture as kinetiks_daily_counters / kinetiks_inbound_events).
--
-- Under test:
--   1. The seed mapping exists (one row per role) and matches
--      @kinetiks/ai SEED_MODELS — the resolver's fallback floor.
--   2. role is unique (one active model per role).
--   3. The partial unique index allows only one OPEN proposal per
--      (role, to_model).
--   4. Service-role-only posture: an authenticated user sees and writes
--      NOTHING on either table (default deny).
-- ============================================================

BEGIN;
SELECT plan(10);

-- 1. Seed mapping.
SELECT is(
  (SELECT count(*)::int FROM kinetiks_model_assignments),
  3,
  'model_assignments: seeded with exactly one row per role'
);
SELECT is(
  (SELECT assigned_model_id FROM kinetiks_model_assignments WHERE role = 'fast'),
  'claude-haiku-4-5-20251001',
  'model_assignments: fast seed matches SEED_MODELS.fast'
);
SELECT is(
  (SELECT assigned_model_id FROM kinetiks_model_assignments WHERE role = 'balanced'),
  'claude-sonnet-4-6',
  'model_assignments: balanced seed matches SEED_MODELS.balanced'
);
SELECT is(
  (SELECT assigned_model_id FROM kinetiks_model_assignments WHERE role = 'deep'),
  'claude-opus-4-8',
  'model_assignments: deep seed matches SEED_MODELS.deep'
);

-- 2. role uniqueness (one active model per role).
SELECT throws_ok(
  $$ INSERT INTO kinetiks_model_assignments (role, assigned_model_id, family)
     VALUES ('balanced', 'claude-sonnet-9-9', 'sonnet') $$,
  '23505',
  NULL,
  'model_assignments: a second row for a role is rejected (role UNIQUE)'
);

-- 3. One open proposal per (role, to_model).
INSERT INTO kinetiks_model_flip_proposals (role, from_model, to_model, family, status)
VALUES ('balanced', 'claude-sonnet-4-6', 'claude-sonnet-4-7', 'sonnet', 'pending');
SELECT throws_ok(
  $$ INSERT INTO kinetiks_model_flip_proposals (role, from_model, to_model, family, status)
     VALUES ('balanced', 'claude-sonnet-4-6', 'claude-sonnet-4-7', 'sonnet', 'pending') $$,
  '23505',
  NULL,
  'model_flip_proposals: a duplicate OPEN proposal for (role,to_model) is rejected'
);
-- But a re-proposal is allowed once the prior one is decided.
UPDATE kinetiks_model_flip_proposals
  SET status = 'rejected', decided_at = now()
  WHERE role = 'balanced' AND to_model = 'claude-sonnet-4-7';
SELECT lives_ok(
  $$ INSERT INTO kinetiks_model_flip_proposals (role, from_model, to_model, family, status)
     VALUES ('balanced', 'claude-sonnet-4-6', 'claude-sonnet-4-7', 'sonnet', 'pending') $$,
  'model_flip_proposals: re-proposing is allowed after the prior one is decided'
);

-- 4. Service-role-only: authenticated users see + write nothing.
SELECT _kt_test_set_auth_user('37777777-7777-7777-7777-777777777777');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_model_assignments),
  0,
  'model_assignments: authenticated users see no rows (no SELECT policy)'
);
SELECT is(
  (SELECT count(*)::int FROM kinetiks_model_flip_proposals),
  0,
  'model_flip_proposals: authenticated users see no rows (no SELECT policy)'
);
SELECT throws_ok(
  $$ INSERT INTO kinetiks_model_flip_proposals (role, from_model, to_model, family, status)
     VALUES ('fast', 'a', 'b', 'haiku', 'pending') $$,
  '42501',
  NULL,
  'model_flip_proposals: authenticated users cannot insert (default deny)'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
