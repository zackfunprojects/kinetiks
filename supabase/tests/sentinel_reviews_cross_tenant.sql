-- ============================================================
-- Cross-tenant isolation: kinetiks_sentinel_reviews
--
-- Account-scoped read/update boundary ("Users can read/update own sentinel
-- reviews"). A user sees only their own content reviews. Subquery-fallback
-- path (no account_id claim set).
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
  alice_account := _kt_test_seed_account(alice_user, 'cf-sr');
  bob_account   := _kt_test_seed_account(bob_user,   'bo-sr');
  PERFORM set_config('test.alice_account', alice_account::text, true);

  INSERT INTO kinetiks_sentinel_reviews
    (account_id, source_app, content_type, content_hash, content)
  VALUES
    (alice_account, 'dm', 'email', 'hash-a', 'alice content'),
    (bob_account,   'dm', 'email', 'hash-b', 'bob content');
END $$;

SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_sentinel_reviews),
  1,
  'sentinel_reviews: alice sees exactly her own review, not bob''s'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_sentinel_reviews),
  current_setting('test.alice_account'),
  'sentinel_reviews: the only visible review belongs to alice'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
