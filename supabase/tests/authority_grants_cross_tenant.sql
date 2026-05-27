-- ============================================================
-- Cross-tenant isolation: kinetiks_authority_grants
--
-- Same invariant as patterns_cross_tenant.sql: no user can read,
-- write, update, or delete another account's authority grants.
-- Authority grant writes are restricted to service role (no
-- INSERT/UPDATE/DELETE policy declared), so the tests below verify
-- both read isolation and the write-deny default for user tokens.
-- ============================================================

BEGIN;
SELECT plan(8);

-- ── Arrange: two seeded accounts + service-role-inserted grants ──
DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-auth');
  bob_account   := _kt_test_seed_account(bob_user,   'bright-otter-auth');

  -- Insert one grant per account as the postgres role (mimics
  -- service-role Authority Agent writes; user tokens cannot do this).
  INSERT INTO kinetiks_authority_grants
    (id, account_id, granted_by, scope_type, scope_description,
     status, granted_at, granted_capabilities)
  VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', alice_account, alice_user,
     'standing', 'Standing Slack notification permission',
     'active', now(),
     '[{"action_class":"kinetiks_id.send_slack_notification","description":"Send notifications to #general","constraints":{"channels":["general"],"max_message_length":2000,"threading_allowed":true},"rate_limit":{"count":20,"window":"day"}}]'::jsonb),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', bob_account, bob_user,
     'standing', 'Standing draft email permission',
     'active', now(),
     '[{"action_class":"kinetiks_id.draft_email","description":"Draft emails up to 5 recipients","constraints":{"max_recipients":5,"max_body_chars":4000,"allowed_from_addresses":"any","attachments_allowed":false},"rate_limit":{"count":30,"window":"day"}}]'::jsonb);
END $$;

-- ── alice sees only her own grant ───────────────────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT results_eq(
  $$ SELECT id FROM kinetiks_authority_grants ORDER BY id $$,
  $$ VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) $$,
  'alice sees only her own authority grant'
);

SELECT is_empty(
  $$ SELECT id FROM kinetiks_authority_grants WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid $$,
  'alice cannot read bob''s grant by id'
);

-- ── User token cannot UPDATE grants (no UPDATE policy) ──────
-- The UPDATE statement runs without error because RLS filters target
-- rows to zero; the row count affected must be zero. Even alice's
-- own row cannot be updated via user token: no UPDATE policy exists.
SELECT lives_ok(
  $$ UPDATE kinetiks_authority_grants SET status = 'paused' WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid $$,
  'alice''s update on bob''s grant runs without throwing (RLS filters target rows)'
);

SELECT lives_ok(
  $$ UPDATE kinetiks_authority_grants SET status = 'paused' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$,
  'alice''s update on her own grant runs without throwing'
);

SELECT _kt_test_clear_auth();

SELECT is(
  (SELECT status FROM kinetiks_authority_grants WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid),
  'active',
  'bob''s grant status remains active after alice''s update attempt'
);

SELECT is(
  (SELECT status FROM kinetiks_authority_grants WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  'active',
  'alice''s own grant status remains active (no UPDATE policy for user tokens)'
);

-- ── User token cannot DELETE grants ─────────────────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT lives_ok(
  $$ DELETE FROM kinetiks_authority_grants WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid $$,
  'alice''s delete on bob''s grant runs without throwing (no DELETE policy filters target rows)'
);

SELECT _kt_test_clear_auth();

SELECT is(
  (SELECT count(*)::int FROM kinetiks_authority_grants WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid),
  1,
  'bob''s grant still exists after alice''s delete attempt'
);

SELECT * FROM finish();
ROLLBACK;
