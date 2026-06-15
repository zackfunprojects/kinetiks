-- ============================================================
-- Cross-tenant isolation: kinetiks_sentinel_overrides
--
-- Account-scoped boundary ("Users can manage own overrides", FOR ALL). A
-- user sees only their own overrides. Each override references a parent
-- sentinel_review owned by the same account. Subquery-fallback path.
-- ============================================================

BEGIN;
SELECT plan(2);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user   uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
  alice_review uuid;
  bob_review uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'cf-so');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-so');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_sentinel_reviews
    (account_id, source_app, content_type, content_hash, content)
  VALUES (alice_account, 'dm', 'email', 'hash-a', 'alice content')
  RETURNING id INTO alice_review;
  INSERT INTO kinetiks_sentinel_reviews
    (account_id, source_app, content_type, content_hash, content)
  VALUES (bob_account, 'dm', 'email', 'hash-b', 'bob content')
  RETURNING id INTO bob_review;

  INSERT INTO kinetiks_sentinel_overrides
    (account_id, review_id, override_type, user_action)
  VALUES
    (alice_account, alice_review, 'released', 'sent_unchanged'),
    (bob_account,   bob_review,   'released', 'sent_unchanged');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_sentinel_overrides),
  1,
  'sentinel_overrides: alice sees exactly her own override, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_sentinel_overrides),
  current_setting('test.alice_account'),
  'sentinel_overrides: the only visible override belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
