-- ============================================================
-- State-machine enforcement: kinetiks_authority_grants
--
-- Validates the lifecycle trigger in 00050_kinetiks_authority_grants.sql:
--   proposed → active | revoked
--   active   → paused | revoked | expired
--   paused   → active | revoked | expired
--   revoked, expired                     (terminal)
--
-- Timestamps stamped automatically on entry:
--   granted_at  on proposed → active
--   revoked_at  on entry to revoked or expired
-- ============================================================

BEGIN;
SELECT plan(14);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  alice_account uuid;
  default_caps jsonb := '[{"action_class":"kinetiks_id.send_slack_notification","description":"Send notifications","constraints":{"channels":"any","max_message_length":2000,"threading_allowed":true},"rate_limit":{"count":20,"window":"day"}}]'::jsonb;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-auth-sm');
  -- INSERT supplies granted_at for active/paused rows and revoked_at
  -- for revoked/expired rows so the lifecycle CHECK constraints
  -- defined in 00050 are satisfied at INSERT time (cannot fix up
  -- afterwards — CHECKs reject the row before any UPDATE could run).
  INSERT INTO kinetiks_authority_grants
    (id, account_id, granted_by, scope_type, scope_description,
     status, granted_at, revoked_at, granted_capabilities)
  VALUES
    ('a1111111-0000-0000-0000-aaaaaaaaaaaa', alice_account, alice_user,
     'standing', 'Proposed standing slot', 'proposed', NULL, NULL, default_caps),
    ('a1111111-0000-0000-0000-bbbbbbbbbbbb', alice_account, alice_user,
     'standing', 'Active standing slot', 'active', now(), NULL, default_caps),
    ('a1111111-0000-0000-0000-cccccccccccc', alice_account, alice_user,
     'standing', 'Active for pause test', 'active', now(), NULL, default_caps),
    ('a1111111-0000-0000-0000-dddddddddddd', alice_account, alice_user,
     'standing', 'Paused for resume', 'paused', now(), NULL, default_caps),
    ('a1111111-0000-0000-0000-eeeeeeeeeeee', alice_account, alice_user,
     'standing', 'Paused for revoke', 'paused', now(), NULL, default_caps),
    ('a1111111-0000-0000-0000-ffffffffffff', alice_account, alice_user,
     'standing', 'Revoked terminal', 'revoked', now(), now(), default_caps),
    ('a1111111-1111-0000-0000-111111111111', alice_account, alice_user,
     'standing', 'Expired terminal', 'expired', now(), now(), default_caps),
    ('a1111111-1111-0000-0000-222222222222', alice_account, alice_user,
     'standing', 'Active for expiry', 'active', now(), NULL, default_caps),
    ('a1111111-1111-0000-0000-333333333333', alice_account, alice_user,
     'standing', 'Paused for expiry', 'paused', now(), NULL, default_caps);
END $$;

-- ── allowed: proposed → active ──────────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_authority_grants SET status = 'active' WHERE id = 'a1111111-0000-0000-0000-aaaaaaaaaaaa' $$,
  'proposed → active is allowed (customer approval)'
);

SELECT isnt(
  (SELECT granted_at FROM kinetiks_authority_grants WHERE id = 'a1111111-0000-0000-0000-aaaaaaaaaaaa'),
  NULL,
  'granted_at is stamped automatically on proposed → active'
);

-- ── allowed: active → paused ────────────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_authority_grants SET status = 'paused' WHERE id = 'a1111111-0000-0000-0000-cccccccccccc' $$,
  'active → paused is allowed (customer pause)'
);

-- ── allowed: paused → active ────────────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_authority_grants SET status = 'active' WHERE id = 'a1111111-0000-0000-0000-dddddddddddd' $$,
  'paused → active is allowed (customer resume)'
);

-- ── allowed: active → revoked ───────────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_authority_grants SET status = 'revoked' WHERE id = 'a1111111-0000-0000-0000-bbbbbbbbbbbb' $$,
  'active → revoked is allowed (customer revoke)'
);

SELECT isnt(
  (SELECT revoked_at FROM kinetiks_authority_grants WHERE id = 'a1111111-0000-0000-0000-bbbbbbbbbbbb'),
  NULL,
  'revoked_at is stamped automatically on entry to revoked'
);

-- ── allowed: paused → revoked ───────────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_authority_grants SET status = 'revoked' WHERE id = 'a1111111-0000-0000-0000-eeeeeeeeeeee' $$,
  'paused → revoked is allowed'
);

-- ── allowed: active → expired ───────────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_authority_grants SET status = 'expired' WHERE id = 'a1111111-1111-0000-0000-222222222222' $$,
  'active → expired is allowed (expiry CRON)'
);

-- ── allowed: paused → expired ───────────────────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_authority_grants SET status = 'expired' WHERE id = 'a1111111-1111-0000-0000-333333333333' $$,
  'paused → expired is allowed (expiry CRON)'
);

-- ── denied: revoked → anything (terminal) ───────────────────
SELECT throws_ok(
  $$ UPDATE kinetiks_authority_grants SET status = 'active' WHERE id = 'a1111111-0000-0000-0000-ffffffffffff' $$,
  '23514', NULL,
  'revoked is terminal — cannot transition back to active'
);

-- ── denied: expired → anything (terminal) ───────────────────
SELECT throws_ok(
  $$ UPDATE kinetiks_authority_grants SET status = 'active' WHERE id = 'a1111111-1111-0000-0000-111111111111' $$,
  '23514', NULL,
  'expired is terminal — cannot transition back to active'
);

-- ── denied: skip transitions (proposed → paused) ────────────
DO $$
DECLARE
  alice_account uuid := (SELECT id FROM kinetiks_accounts WHERE user_id = '11111111-1111-1111-1111-111111111111');
  default_caps jsonb := '[{"action_class":"kinetiks_id.send_slack_notification","description":"Send notifications","constraints":{"channels":"any","max_message_length":2000,"threading_allowed":true},"rate_limit":{"count":20,"window":"day"}}]'::jsonb;
BEGIN
  INSERT INTO kinetiks_authority_grants
    (id, account_id, granted_by, scope_type, scope_description,
     status, granted_capabilities)
  VALUES
    ('a2222222-0000-0000-0000-aaaaaaaaaaaa', alice_account, '11111111-1111-1111-1111-111111111111',
     'standing', 'Skip-test proposed', 'proposed', default_caps);
END $$;

SELECT throws_ok(
  $$ UPDATE kinetiks_authority_grants SET status = 'paused' WHERE id = 'a2222222-0000-0000-0000-aaaaaaaaaaaa' $$,
  '23514', NULL,
  'proposed → paused is denied (must go through active first)'
);

-- ── denied: skip transitions (proposed → expired) ───────────
SELECT throws_ok(
  $$ UPDATE kinetiks_authority_grants SET status = 'expired' WHERE id = 'a2222222-0000-0000-0000-aaaaaaaaaaaa' $$,
  '23514', NULL,
  'proposed → expired is denied (expiry only applies to active or paused)'
);

-- ── denied: backward transition (active → proposed) ─────────
SELECT throws_ok(
  $$ UPDATE kinetiks_authority_grants SET status = 'proposed' WHERE id = 'a1111111-0000-0000-0000-aaaaaaaaaaaa' $$,
  '23514', NULL,
  'active → proposed is denied (backward transitions forbidden)'
);

SELECT * FROM finish();
ROLLBACK;
