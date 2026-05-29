-- ============================================================
-- Cross-tenant isolation: kinetiks_social_posts (Phase 7)
--
-- Same invariant as kinetiks_authority_grants_cross_tenant.sql: no
-- user can read, write, update, or delete another account's social
-- posts. Writes are restricted to service role (no INSERT/UPDATE/
-- DELETE policy declared); tests verify read isolation + the
-- write-deny default for user tokens.
-- ============================================================

BEGIN;
SELECT plan(8);

DO $$
DECLARE
  alice_user uuid := '55555555-5555-5555-5555-555555555555';
  bob_user uuid := '66666666-6666-6666-6666-666666666666';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'umber-fox-social');
  bob_account   := _kt_test_seed_account(bob_user,   'coral-otter-social');

  -- Insert one social post per account.
  INSERT INTO kinetiks_social_posts
    (id, account_id, source, provider_post_id, posted_at, content_summary, engagement, metadata)
  VALUES
    ('aaaa1111-aaaa-1111-aaaa-111111111111', alice_account, 'tiktok',
     'tiktok-alice-1', now(), 'hello tiktok',
     '{"views": 100, "likes": 10}'::jsonb,
     '{"hashtags": ["alice"], "post_url": "https://tiktok.com/@alice/video/1"}'::jsonb),
    ('bbbb2222-bbbb-2222-bbbb-222222222222', bob_account, 'twitter',
     'tweet-bob-1', now(), 'hello twitter',
     '{"likes": 5, "impressions": 50}'::jsonb,
     '{"hashtags": ["bob"], "post_url": "https://twitter.com/bob/status/1"}'::jsonb);
END $$;

-- ── alice sees only her own post ───────────────────────────
SELECT _kt_test_set_auth_user('55555555-5555-5555-5555-555555555555');

SELECT results_eq(
  $$ SELECT id FROM kinetiks_social_posts ORDER BY id $$,
  $$ VALUES ('aaaa1111-aaaa-1111-aaaa-111111111111'::uuid) $$,
  'alice sees only her own social post'
);

SELECT is_empty(
  $$ SELECT id FROM kinetiks_social_posts WHERE id = 'bbbb2222-bbbb-2222-bbbb-222222222222'::uuid $$,
  'alice cannot read bob''s post by id'
);

-- ── User token cannot INSERT social posts ──────────────────
SELECT throws_ok(
  $$ INSERT INTO kinetiks_social_posts
       (id, account_id, source, provider_post_id, posted_at, engagement, metadata)
     VALUES
       ('cccc3333-cccc-3333-cccc-333333333333',
        (SELECT id FROM kinetiks_accounts WHERE user_id = '66666666-6666-6666-6666-666666666666'),
        'twitter', 'plant-1', now(),
        '{}'::jsonb, '{}'::jsonb)
  $$,
  '42501', NULL,
  'alice cannot INSERT a post for bob''s account (RLS default-deny)'
);

SELECT throws_ok(
  $$ INSERT INTO kinetiks_social_posts
       (id, account_id, source, provider_post_id, posted_at, engagement, metadata)
     VALUES
       ('dddd4444-dddd-4444-dddd-444444444444',
        (SELECT id FROM kinetiks_accounts WHERE user_id = '55555555-5555-5555-5555-555555555555'),
        'twitter', 'plant-2', now(),
        '{}'::jsonb, '{}'::jsonb)
  $$,
  '42501', NULL,
  'alice cannot INSERT a post even on her own account (no INSERT policy for user tokens)'
);

-- ── User token cannot UPDATE social posts ──────────────────
SELECT lives_ok(
  $$ UPDATE kinetiks_social_posts SET content_summary = 'tampered' WHERE id = 'bbbb2222-bbbb-2222-bbbb-222222222222'::uuid $$,
  'alice''s update on bob''s post runs without throwing (RLS filters target rows)'
);

SELECT _kt_test_clear_auth();

SELECT is(
  (SELECT content_summary FROM kinetiks_social_posts WHERE id = 'bbbb2222-bbbb-2222-bbbb-222222222222'::uuid),
  'hello twitter',
  'bob''s post content unchanged after alice''s update attempt'
);

-- ── User token cannot DELETE social posts ──────────────────
SELECT _kt_test_set_auth_user('55555555-5555-5555-5555-555555555555');

SELECT lives_ok(
  $$ DELETE FROM kinetiks_social_posts WHERE id = 'bbbb2222-bbbb-2222-bbbb-222222222222'::uuid $$,
  'alice''s delete on bob''s post runs without throwing (no DELETE policy)'
);

SELECT _kt_test_clear_auth();

SELECT is(
  (SELECT count(*)::int FROM kinetiks_social_posts WHERE id = 'bbbb2222-bbbb-2222-bbbb-222222222222'::uuid),
  1,
  'bob''s post still exists after alice''s delete attempt'
);

SELECT * FROM finish();
ROLLBACK;
