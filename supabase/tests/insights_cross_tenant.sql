-- ============================================================
-- Cross-tenant isolation + one-way user fields for kinetiks_insights.
-- ============================================================

BEGIN;
SELECT plan(8);

-- Arrange: two accounts with one insight each (service role inserts).
DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-ins');
  bob_account := _kt_test_seed_account(bob_user, 'bright-otter-ins');

  INSERT INTO kinetiks_insights (id, account_id, type, severity, summary)
  VALUES
    ('c1111111-0000-0000-0000-aaaaaaaaaaaa', alice_account, 'identity_update', 'info',    'Alice voice updated'),
    ('c1111111-0000-0000-0000-bbbbbbbbbbbb', bob_account,   'identity_update', 'notable', 'Bob voice updated');
END $$;

-- ── Alice reads only her own row ────────────────────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');
SELECT results_eq(
  $$ SELECT id FROM kinetiks_insights WHERE id IN ('c1111111-0000-0000-0000-aaaaaaaaaaaa', 'c1111111-0000-0000-0000-bbbbbbbbbbbb') ORDER BY id $$,
  $$ VALUES ('c1111111-0000-0000-0000-aaaaaaaaaaaa'::uuid) $$,
  'alice sees her insight, not bob''s'
);

-- ── Alice can dismiss her own insight ───────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_insights SET dismissed = true WHERE id = 'c1111111-0000-0000-0000-aaaaaaaaaaaa' $$,
  'alice can dismiss her own insight'
);

SELECT is(
  (SELECT dismissed FROM kinetiks_insights WHERE id = 'c1111111-0000-0000-0000-aaaaaaaaaaaa'),
  true,
  'dismissed was persisted'
);

-- ── Once dismissed, dismissed cannot be unset ───────────────
SELECT throws_ok(
  $$ UPDATE kinetiks_insights SET dismissed = false WHERE id = 'c1111111-0000-0000-0000-aaaaaaaaaaaa' $$,
  '23514', NULL,
  'dismissed cannot be reverted to false'
);

-- ── acted_on flip stamps the timestamp ──────────────────────
-- Seed as service role: kinetiks_insights has no user INSERT policy,
-- so clear the authenticated context before inserting.
SELECT _kt_test_clear_auth();
DO $$
DECLARE
  alice_account uuid := (SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111');
BEGIN
  INSERT INTO kinetiks_insights (id, account_id, type, severity, summary)
  VALUES ('c1111111-1111-1111-1111-aaaaaaaaaaaa', alice_account, 'opportunity', 'info', 'tag me as acted_on');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');
SELECT lives_ok(
  $$ UPDATE kinetiks_insights SET acted_on = true WHERE id = 'c1111111-1111-1111-1111-aaaaaaaaaaaa' $$,
  'alice can mark her insight as acted_on'
);

SELECT isnt(
  (SELECT acted_on_at FROM kinetiks_insights WHERE id = 'c1111111-1111-1111-1111-aaaaaaaaaaaa'),
  NULL,
  'acted_on_at was stamped by the trigger'
);

-- ── Alice cannot update Bob's insight (RLS filters) ─────────
SELECT lives_ok(
  $$ UPDATE kinetiks_insights SET dismissed = true WHERE id = 'c1111111-0000-0000-0000-bbbbbbbbbbbb' $$,
  'update against bob''s row runs (RLS filters target rows)'
);

SELECT _kt_test_clear_auth();
SELECT is(
  (SELECT dismissed FROM kinetiks_insights WHERE id = 'c1111111-0000-0000-0000-bbbbbbbbbbbb'),
  false,
  'bob''s insight is unchanged after alice''s update attempt'
);

SELECT * FROM finish();
ROLLBACK;
