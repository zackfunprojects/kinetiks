-- ============================================================
-- Cross-tenant isolation: kinetiks_webhooks
--
-- Account-scoped read boundary ("Users can read own webhooks"). A user
-- sees only their own webhook registrations. Writes are gated by the
-- create/update/delete policies; this suite covers the read boundary on
-- the subquery-fallback path (no account_id claim set).
-- ============================================================

BEGIN;
SELECT plan(2);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user   uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'cf-wh');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-wh');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_webhooks (account_id, url, secret, events)
  VALUES (alice_account, 'https://alice.test/hook', 's', ARRAY['proposal.created']),
         (bob_account,   'https://bob.test/hook',   's', ARRAY['proposal.created']);
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_webhooks),
  1,
  'webhooks: alice sees exactly her own webhook, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_webhooks),
  current_setting('test.alice_account'),
  'webhooks: the only visible webhook belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
