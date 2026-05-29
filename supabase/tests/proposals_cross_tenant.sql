-- ============================================================
-- Cross-tenant isolation: kinetiks_proposals
--
-- The most important invariant in the platform: no user can read,
-- write, update, or delete another account's proposals. If this test
-- fails for any reason, the leak is a P0.
--
-- Canonical example per the plan; every new user-owned table copies
-- this structure with the relevant table substituted.
-- ============================================================

BEGIN;
SELECT plan(6);

-- ── Arrange: two seeded accounts ─────────────────────────────
DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox');
  bob_account   := _kt_test_seed_account(bob_user, 'bright-otter');

  -- Insert one proposal per account (as service role)
  INSERT INTO kinetiks_proposals (id, account_id, source_app, target_layer, action, confidence, payload)
  VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', alice_account, 'harvest', 'org', 'add', 'inferred', '{}'::jsonb),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', bob_account,   'harvest', 'org', 'add', 'inferred', '{}'::jsonb);
END $$;

-- ── Act + Assert: alice sees only her own proposal ───────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT results_eq(
  $$ SELECT id FROM kinetiks_proposals ORDER BY id $$,
  $$ VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) $$,
  'alice sees only her own proposal'
);

SELECT is_empty(
  $$ SELECT id FROM kinetiks_proposals WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid $$,
  'alice cannot read bob''s proposal by id'
);

-- ── Act + Assert: alice cannot update bob's proposal ─────────
SELECT lives_ok(
  $$ UPDATE kinetiks_proposals SET action = 'update' WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid $$,
  'update statement runs without error (RLS filters target rows)'
);

SELECT _kt_test_clear_auth();

SELECT is(
  (SELECT action FROM kinetiks_proposals WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid),
  'add',
  'bob''s proposal action is unchanged after alice''s update attempt'
);

-- ── Act + Assert: alice cannot delete bob's proposal ─────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT lives_ok(
  $$ DELETE FROM kinetiks_proposals WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid $$,
  'delete statement runs without error (RLS filters target rows)'
);

SELECT _kt_test_clear_auth();

SELECT is(
  (SELECT count(*)::int FROM kinetiks_proposals WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid),
  1,
  'bob''s proposal still exists after alice''s delete attempt'
);

SELECT * FROM finish();
ROLLBACK;
