-- ============================================================
-- JWT cutover (batch 2) — claim-path coverage for the non-trivial shapes.
--
-- Batch 1's claim-path suite proved the clean `account_id = helper` rewrite.
-- This suite covers the two shapes unique to 00086:
--   1. NULL-or-variant (kinetiks_ai_calls): an account_id IS NULL row is
--      globally readable; account-scoped rows isolate via the claim.
--   2. Parent-join (kinetiks_webhook_deliveries via kinetiks_webhooks): the
--      inner account subquery was swapped for the helper; isolation must hold
--      through the parent join, and the claim must be authoritative.
--
-- The plain `account_id = helper` rewrites (api_keys, social_posts, etc.)
-- share batch 1's proven mechanism and are covered by their existing
-- *_cross_tenant.sql fallback suites.
-- ============================================================

BEGIN;
SELECT plan(6);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user   uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
  alice_webhook uuid;
  bob_webhook uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'cf-plat-alice');
  bob_account   := _kt_test_seed_account(bob_user,   'cf-plat-bob');
  PERFORM set_config('test.alice_account', alice_account::text, true);
  PERFORM set_config('test.bob_account', bob_account::text, true);

  -- ai_calls: a global (NULL-account) row plus one per tenant.
  INSERT INTO kinetiks_ai_calls (account_id, task, model, attempt_number, status, latency_ms)
  VALUES (NULL,          'system.boot',         'claude-haiku-4-5-20251001', 1, 'success', 10),
         (alice_account, 'marcus.pre_analysis', 'claude-haiku-4-5-20251001', 1, 'success', 320),
         (bob_account,   'marcus.pre_analysis', 'claude-haiku-4-5-20251001', 1, 'success', 280);

  -- webhooks (parent) + one delivery each (child scoped through the parent).
  INSERT INTO kinetiks_webhooks (account_id, url, secret, events)
  VALUES (alice_account, 'https://a.test/hook', 's', ARRAY['proposal.created'])
  RETURNING id INTO alice_webhook;
  INSERT INTO kinetiks_webhooks (account_id, url, secret, events)
  VALUES (bob_account, 'https://b.test/hook', 's', ARRAY['proposal.created'])
  RETURNING id INTO bob_webhook;
  PERFORM set_config('test.alice_webhook', alice_webhook::text, true);
  PERFORM set_config('test.bob_webhook', bob_webhook::text, true);

  INSERT INTO kinetiks_webhook_deliveries (webhook_id, event_type, payload)
  VALUES (alice_webhook, 'proposal.created', '{}'::jsonb),
         (bob_webhook,   'proposal.created', '{}'::jsonb);
END $$;

-- ── ai_calls (NULL-or-variant) ──
-- Alice's claim: the global row (NULL) plus Alice's own row = 2 visible.
SELECT _kt_test_set_auth_user(
  '11111111-1111-1111-1111-111111111111'::uuid,
  current_setting('test.alice_account')::uuid
);
SELECT is(
  (SELECT count(*)::int FROM kinetiks_ai_calls),
  2,
  'ai_calls: alice claim sees the global NULL row + her own (not bob''s)'
);
SELECT is(
  (SELECT string_agg(account_id::text, ',' ORDER BY account_id) FROM kinetiks_ai_calls WHERE account_id IS NOT NULL),
  current_setting('test.alice_account'),
  'ai_calls: the only scoped row visible to alice is alice''s'
);
SELECT _kt_test_clear_auth();

-- Alice's sub + Bob's claim: scoped visibility follows the CLAIM (bob), the
-- NULL row stays visible.
SELECT _kt_test_set_auth_user(
  '11111111-1111-1111-1111-111111111111'::uuid,
  current_setting('test.bob_account')::uuid
);
SELECT is(
  (SELECT string_agg(account_id::text, ',' ORDER BY account_id) FROM kinetiks_ai_calls WHERE account_id IS NOT NULL),
  current_setting('test.bob_account'),
  'ai_calls: claim authoritative — bob-claimed sees bob''s scoped row'
);
SELECT _kt_test_clear_auth();

-- ── webhook_deliveries (parent-join) ──
SELECT _kt_test_set_auth_user(
  '11111111-1111-1111-1111-111111111111'::uuid,
  current_setting('test.alice_account')::uuid
);
SELECT is(
  (SELECT count(*)::int FROM kinetiks_webhook_deliveries),
  1,
  'webhook_deliveries: alice claim sees only her delivery (through the parent join)'
);
SELECT is(
  (SELECT webhook_id::text FROM kinetiks_webhook_deliveries),
  current_setting('test.alice_webhook'),
  'webhook_deliveries: the visible delivery belongs to alice''s webhook'
);
SELECT _kt_test_clear_auth();

SELECT _kt_test_set_auth_user(
  '11111111-1111-1111-1111-111111111111'::uuid,
  current_setting('test.bob_account')::uuid
);
SELECT is(
  (SELECT webhook_id::text FROM kinetiks_webhook_deliveries),
  current_setting('test.bob_webhook'),
  'webhook_deliveries: claim authoritative through the parent join (bob-claimed sees bob''s)'
);
SELECT _kt_test_clear_auth();

SELECT * FROM finish();
ROLLBACK;
