-- ============================================================
-- Cross-tenant isolation: kinetiks_pattern_library
--
-- Same invariant as proposals_cross_tenant.sql: no user can read,
-- write, update, or delete another account's patterns. Pattern Library
-- writes are restricted to service role (no INSERT/UPDATE/DELETE policy
-- declared), so the tests below verify both read isolation and the
-- write-deny default for user tokens.
-- ============================================================

BEGIN;
SELECT plan(8);

-- ── Arrange: two seeded accounts + service-role-inserted patterns ──
DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-pat');
  bob_account   := _kt_test_seed_account(bob_user,   'bright-otter-pat');

  -- Insert one pattern per account as the postgres role (mimics
  -- service-role Archivist writes; user tokens cannot do this).
  INSERT INTO kinetiks_pattern_library
    (id, account_id, pattern_type, emitting_app, fingerprint, dimensions,
     effective_decay_days, decay_at)
  VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', alice_account, 'harvest.outreach_angle_performance',
     'harvest', 'fp-alice-1', '{"a":1}'::jsonb, 30, now() + interval '30 days'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', bob_account,   'harvest.outreach_angle_performance',
     'harvest', 'fp-bob-1',   '{"a":2}'::jsonb, 30, now() + interval '30 days');
END $$;

-- ── alice sees only her own pattern ─────────────────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT results_eq(
  $$ SELECT id FROM kinetiks_pattern_library ORDER BY id $$,
  $$ VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) $$,
  'alice sees only her own pattern'
);

SELECT is_empty(
  $$ SELECT id FROM kinetiks_pattern_library WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid $$,
  'alice cannot read bob''s pattern by id'
);

-- ── User token cannot UPDATE patterns (no UPDATE policy) ────
-- The UPDATE statement runs without error because RLS filters target
-- rows to zero (alice owns no patterns by bob's id), but the row count
-- affected must be zero.
SELECT lives_ok(
  $$ UPDATE kinetiks_pattern_library SET user_starred = true WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid $$,
  'alice''s update on bob''s pattern runs without throwing (RLS filters target rows)'
);

-- Even alice's own row cannot be updated via user token: no UPDATE policy
-- exists. Statement runs but the row remains unmodified.
SELECT lives_ok(
  $$ UPDATE kinetiks_pattern_library SET user_starred = true WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$,
  'alice''s update on her own pattern runs without throwing'
);

SELECT _kt_test_clear_auth();

SELECT is(
  (SELECT user_starred FROM kinetiks_pattern_library WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid),
  false,
  'bob''s pattern user_starred remains false after alice''s update attempt'
);

SELECT is(
  (SELECT user_starred FROM kinetiks_pattern_library WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  false,
  'alice''s own pattern user_starred remains false (no UPDATE policy for user tokens)'
);

-- ── User token cannot DELETE patterns ────────────────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT lives_ok(
  $$ DELETE FROM kinetiks_pattern_library WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid $$,
  'alice''s delete on bob''s pattern runs without throwing (no DELETE policy filters target rows)'
);

SELECT _kt_test_clear_auth();

SELECT is(
  (SELECT count(*)::int FROM kinetiks_pattern_library WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid),
  1,
  'bob''s pattern still exists after alice''s delete attempt'
);

SELECT * FROM finish();
ROLLBACK;
