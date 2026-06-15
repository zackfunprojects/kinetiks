-- ============================================================
-- Cross-tenant isolation: kinetiks_annotations
--
-- No user can read, write, update, or delete another account's
-- annotations. Writes are service-role only (no INSERT/UPDATE/DELETE
-- policy), so the tests verify both read isolation and the write-deny
-- default for user tokens.
-- ============================================================

BEGIN;
SELECT plan(9);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-anno');
  bob_account   := _kt_test_seed_account(bob_user,   'bright-otter-anno');

  INSERT INTO kinetiks_annotations
    (id, account_id, thread_id, kind, component_id, field_name, summary, body)
  VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', alice_account, 'thr-a',
     'decision_note', 'subject', 'subject_line',
     'Chose directness', 'Your voice profile emphasizes directness over curiosity hooks.'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', bob_account, 'thr-b',
     'suggestion', 'body', 'email_body',
     'Add a P.S.', 'Similar sequences saw 12% higher reply rates with a P.S.');
END $$;

-- ── alice sees only her own annotation ──────────────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT results_eq(
  $$ SELECT id FROM kinetiks_annotations ORDER BY id $$,
  $$ VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) $$,
  'alice sees only her own annotation'
);

SELECT is_empty(
  $$ SELECT id FROM kinetiks_annotations WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid $$,
  'alice cannot read bob''s annotation by id'
);

-- ── User token cannot UPDATE (no UPDATE policy) ─────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_annotations SET dismissed = true WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid $$,
  'alice''s update on bob''s annotation runs without throwing (RLS filters target rows)'
);
SELECT lives_ok(
  $$ UPDATE kinetiks_annotations SET dismissed = true WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$,
  'alice''s update on her own annotation runs without throwing'
);

SELECT _kt_test_clear_auth();

SELECT is(
  (SELECT dismissed FROM kinetiks_annotations WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid),
  false,
  'bob''s annotation stays undismissed after alice''s update attempt'
);
SELECT is(
  (SELECT dismissed FROM kinetiks_annotations WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  false,
  'alice''s own annotation stays undismissed (no UPDATE policy for user tokens)'
);

-- ── User token cannot INSERT (no INSERT policy) ─────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT throws_ok(
  $$ INSERT INTO kinetiks_annotations
       (account_id, thread_id, kind, component_id, field_name, summary, body)
     VALUES
       ((SELECT id FROM kinetiks_accounts WHERE user_id = '22222222-2222-2222-2222-222222222222'),
        'thr-x', 'decision_note', 'c', 'f', 's', 'b') $$,
  '42501', NULL,
  'alice cannot INSERT an annotation for bob''s account (RLS default-deny)'
);

SELECT throws_ok(
  $$ INSERT INTO kinetiks_annotations
       (account_id, thread_id, kind, component_id, field_name, summary, body)
     VALUES
       ((SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111'),
        'thr-x', 'decision_note', 'c', 'f', 's', 'b') $$,
  '42501', NULL,
  'alice cannot INSERT an annotation even on her own account (no INSERT policy)'
);

SELECT _kt_test_clear_auth();

SELECT is(
  (SELECT count(*)::int FROM kinetiks_annotations),
  2,
  'no annotation rows were inserted by either alice INSERT attempt'
);

SELECT * FROM finish();
ROLLBACK;
