-- ============================================================
-- Phase 5: default_origin columns on kinetiks_authority_grants
--
-- Three invariants under test:
--
--   1. Cross-tenant isolation. Alice cannot read Bob's
--      default-origin grants (RLS unchanged from 00050; new columns
--      do not loosen the policy).
--
--   2. CHECK constraint `default_origin_consistent` rejects rows
--      with one column null and the other set.
--
--   3. UNIQUE partial index
--      `idx_authority_grants_default_origin_active` rejects a second
--      non-terminal grant for the same (account, app, key) triple
--      but allows a new grant after the prior one is revoked/expired.
-- ============================================================

BEGIN;
SELECT plan(11);

DO $$
DECLARE
  alice_user uuid := '33333333-3333-3333-3333-333333333333';
  bob_user uuid := '44444444-4444-4444-4444-444444444444';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'amber-fox-defaults');
  bob_account   := _kt_test_seed_account(bob_user,   'silver-otter-defaults');

  -- Alice gets one signup-accepted default-origin grant.
  INSERT INTO kinetiks_authority_grants
    (id, account_id, granted_by, scope_type, scope_description,
     status, granted_at, granted_capabilities,
     default_origin_app, default_origin_key)
  VALUES
    ('11111111-aaaa-1111-aaaa-111111111111', alice_account, alice_user,
     'standing', 'Slack notify default',
     'active', now(),
     '[{"action_class":"kinetiks_id.send_slack_notification","description":"x","constraints":{"channels":"any","users":"any","max_message_length":4000,"threading_allowed":true},"rate_limit":{"count":10,"window":"day"}}]'::jsonb,
     'kinetiks_id', 'marcus_proactive_slack_notifications'),
    ('22222222-bbbb-2222-bbbb-222222222222', bob_account, bob_user,
     'standing', 'Email draft default',
     'active', now(),
     '[{"action_class":"kinetiks_id.draft_email","description":"x","constraints":{"max_recipients":10,"max_body_chars":8000,"allowed_from_addresses":"any","attachments_allowed":false},"rate_limit":{"count":15,"window":"day"}}]'::jsonb,
     'kinetiks_id', 'marcus_email_drafts');
END $$;

-- ── (1) Alice sees only her own default-origin grant ─────────
SELECT _kt_test_set_auth_user('33333333-3333-3333-3333-333333333333');

SELECT results_eq(
  $$ SELECT id FROM kinetiks_authority_grants
     WHERE default_origin_app IS NOT NULL ORDER BY id $$,
  $$ VALUES ('11111111-aaaa-1111-aaaa-111111111111'::uuid) $$,
  'alice sees only her own default-origin grant'
);

SELECT is_empty(
  $$ SELECT id FROM kinetiks_authority_grants
     WHERE default_origin_key = 'marcus_email_drafts'
       AND default_origin_app = 'kinetiks_id' $$,
  'alice cannot read bob''s default-origin grant via origin filter'
);

SELECT _kt_test_clear_auth();

-- ── (2) CHECK default_origin_consistent ──────────────────────
-- Both null: legal (Authority Agent grants pre-Phase-5 callers).
SELECT lives_ok(
  $$ INSERT INTO kinetiks_authority_grants
       (id, account_id, granted_by, scope_type, scope_description,
        status, granted_at, granted_capabilities)
     VALUES
       ('33333333-cccc-3333-cccc-333333333333',
        (SELECT id FROM kinetiks_accounts WHERE user_id = '33333333-3333-3333-3333-333333333333'),
        '33333333-3333-3333-3333-333333333333',
        'standing', 'no origin', 'active', now(),
        '[{"action_class":"kinetiks_id.send_slack_notification","description":"x","constraints":{"channels":"any","users":"any","max_message_length":1000,"threading_allowed":false},"rate_limit":null}]'::jsonb)
  $$,
  'inserting with both default_origin_* null succeeds'
);

-- Both set: legal.
SELECT lives_ok(
  $$ INSERT INTO kinetiks_authority_grants
       (id, account_id, granted_by, scope_type, scope_description,
        status, granted_at, granted_capabilities,
        default_origin_app, default_origin_key)
     VALUES
       ('44444444-dddd-4444-dddd-444444444444',
        (SELECT id FROM kinetiks_accounts WHERE user_id = '33333333-3333-3333-3333-333333333333'),
        '33333333-3333-3333-3333-333333333333',
        'standing', 'consistent origin', 'active', now(),
        '[{"action_class":"kinetiks_id.send_slack_notification","description":"x","constraints":{"channels":"any","users":"any","max_message_length":1000,"threading_allowed":false},"rate_limit":null}]'::jsonb,
        'kinetiks_id', 'some_future_key')
  $$,
  'inserting with both default_origin_* set succeeds'
);

-- Only app set: illegal.
SELECT throws_ok(
  $$ INSERT INTO kinetiks_authority_grants
       (id, account_id, granted_by, scope_type, scope_description,
        status, granted_at, granted_capabilities,
        default_origin_app)
     VALUES
       ('55555555-eeee-5555-eeee-555555555555',
        (SELECT id FROM kinetiks_accounts WHERE user_id = '33333333-3333-3333-3333-333333333333'),
        '33333333-3333-3333-3333-333333333333',
        'standing', 'half origin', 'active', now(),
        '[{"action_class":"kinetiks_id.send_slack_notification","description":"x","constraints":{"channels":"any","users":"any","max_message_length":1000,"threading_allowed":false},"rate_limit":null}]'::jsonb,
        'kinetiks_id')
  $$,
  '23514',
  NULL,
  'default_origin_app without _key rejected by CHECK'
);

-- Only key set: illegal.
SELECT throws_ok(
  $$ INSERT INTO kinetiks_authority_grants
       (id, account_id, granted_by, scope_type, scope_description,
        status, granted_at, granted_capabilities,
        default_origin_key)
     VALUES
       ('66666666-ffff-6666-ffff-666666666666',
        (SELECT id FROM kinetiks_accounts WHERE user_id = '33333333-3333-3333-3333-333333333333'),
        '33333333-3333-3333-3333-333333333333',
        'standing', 'half origin', 'active', now(),
        '[{"action_class":"kinetiks_id.send_slack_notification","description":"x","constraints":{"channels":"any","users":"any","max_message_length":1000,"threading_allowed":false},"rate_limit":null}]'::jsonb,
        'orphan_key')
  $$,
  '23514',
  NULL,
  'default_origin_key without _app rejected by CHECK'
);

-- ── (3) Unique partial index for (account, app, key) on non-terminal statuses ──
-- Alice's existing 'marcus_proactive_slack_notifications' is active.
-- A second active or proposed insertion for the same (account, app,
-- key) must be rejected with 23505 (unique_violation).
SELECT throws_ok(
  $$ INSERT INTO kinetiks_authority_grants
       (id, account_id, granted_by, scope_type, scope_description,
        status, granted_at, granted_capabilities,
        default_origin_app, default_origin_key)
     VALUES
       ('77777777-1111-7777-1111-777777777777',
        (SELECT id FROM kinetiks_accounts WHERE user_id = '33333333-3333-3333-3333-333333333333'),
        '33333333-3333-3333-3333-333333333333',
        'standing', 'duplicate active default', 'active', now(),
        '[{"action_class":"kinetiks_id.send_slack_notification","description":"x","constraints":{"channels":"any","users":"any","max_message_length":1000,"threading_allowed":false},"rate_limit":null}]'::jsonb,
        'kinetiks_id', 'marcus_proactive_slack_notifications')
  $$,
  '23505',
  NULL,
  'second active grant for same (account, app, key) rejected by unique partial index'
);

-- Revoke alice's existing default-origin grant.
UPDATE kinetiks_authority_grants
  SET status = 'revoked', revoked_at = now(), revocation_reason = 'customer_revoked'
  WHERE id = '11111111-aaaa-1111-aaaa-111111111111';

-- Now the same (account, app, key) is insertable again because the
-- partial index excludes revoked rows.
SELECT lives_ok(
  $$ INSERT INTO kinetiks_authority_grants
       (id, account_id, granted_by, scope_type, scope_description,
        status, granted_at, granted_capabilities,
        default_origin_app, default_origin_key)
     VALUES
       ('88888888-2222-8888-2222-888888888888',
        (SELECT id FROM kinetiks_accounts WHERE user_id = '33333333-3333-3333-3333-333333333333'),
        '33333333-3333-3333-3333-333333333333',
        'standing', 're-proposed default', 'active', now(),
        '[{"action_class":"kinetiks_id.send_slack_notification","description":"x","constraints":{"channels":"any","users":"any","max_message_length":1000,"threading_allowed":false},"rate_limit":null}]'::jsonb,
        'kinetiks_id', 'marcus_proactive_slack_notifications')
  $$,
  're-proposing the same (app, key) is allowed once the prior is revoked'
);

-- ── (4) Index lookup matches the diff cron query shape ────────
-- Sanity-check the SELECT pattern the internal route uses to find
-- covered keys per (account, app). Returns exactly the active key.
SELECT results_eq(
  $$ SELECT default_origin_key FROM kinetiks_authority_grants
     WHERE account_id = (SELECT id FROM kinetiks_accounts WHERE user_id = '33333333-3333-3333-3333-333333333333')
       AND default_origin_app = 'kinetiks_id'
       AND status IN ('proposed', 'active', 'paused')
     ORDER BY default_origin_key $$,
  $$ VALUES ('marcus_proactive_slack_notifications'::text), ('some_future_key'::text) $$,
  'diff cron coverage query returns exactly the non-terminal default-origin keys for the account'
);

-- ── (5) User token cannot INSERT default-origin grants ────────
-- Same RLS as 00050: no INSERT policy for user tokens. The new
-- columns inherit the policy because they are part of the same
-- table.
SELECT _kt_test_set_auth_user('33333333-3333-3333-3333-333333333333');

SELECT throws_ok(
  $$ INSERT INTO kinetiks_authority_grants
       (id, account_id, granted_by, scope_type, scope_description,
        status, granted_at, granted_capabilities,
        default_origin_app, default_origin_key)
     VALUES
       ('99999999-3333-9999-3333-999999999999',
        (SELECT id FROM kinetiks_accounts WHERE user_id = '33333333-3333-3333-3333-333333333333'),
        '33333333-3333-3333-3333-333333333333',
        'standing', 'alice plants a default', 'active', now(),
        '[{"action_class":"kinetiks_id.send_slack_notification","description":"x","constraints":{"channels":"any","users":"any","max_message_length":1000,"threading_allowed":false},"rate_limit":null}]'::jsonb,
        'kinetiks_id', 'self_planted')
  $$,
  '42501', NULL,
  'user-token INSERT of default-origin grant rejected by RLS default-deny'
);

SELECT _kt_test_clear_auth();

SELECT is(
  (SELECT count(*)::int FROM kinetiks_authority_grants WHERE id = '99999999-3333-9999-3333-999999999999'::uuid),
  0,
  'no row was inserted by the user-token attempt'
);

SELECT * FROM finish();
ROLLBACK;
