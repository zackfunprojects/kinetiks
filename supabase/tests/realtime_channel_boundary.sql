-- ============================================================
-- Realtime Authorization: collaborative channel boundary (00091)
--
-- The subscribe/broadcast boundary for the collaborative Realtime channels
-- (spec §12). realtime.messages RLS wraps public.kinetiks_realtime_topic_owned();
-- this suite proves that predicate denies foreign-account, malformed, and
-- non-collaborative topics while allowing the caller's own collaborative topics
-- for every prefix — the cross-account presence/annotation boundary that must
-- never break. Also asserts the two realtime.messages policies are wired.
--
-- Runs the predicate as the authenticated role with each account's JWT claims,
-- exactly as the policy evaluates it at subscribe/broadcast time.
-- ============================================================

BEGIN;
SELECT plan(13);

DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user   uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
  PERFORM _kt_test_seed_account(alice_user, 'copper-fox-rt');
  PERFORM _kt_test_seed_account(bob_user,   'bright-otter-rt');
END $$;

-- Resolve the two account ids for topic construction.
-- (Read under postgres before switching to a scoped role.)
CREATE TEMP TABLE _rt_acct AS
  SELECT
    (SELECT id FROM kinetiks_accounts WHERE codename = 'copper-fox-rt')   AS alice,
    (SELECT id FROM kinetiks_accounts WHERE codename = 'bright-otter-rt') AS bob;
-- The predicate is evaluated under the `authenticated` role (claim branch),
-- which cannot see bob's account row through kinetiks_accounts RLS — so the
-- topic-construction ids are stashed here and granted across the role switch.
GRANT SELECT ON _rt_acct TO authenticated;

-- ── parser is exact about shape (role-independent) ──────────
SELECT is(
  public.kinetiks_realtime_channel_account('presence:acc:thr'),
  'acc',
  'parser extracts the account segment from a well-formed presence topic'
);
SELECT is(
  public.kinetiks_realtime_channel_account('mystery:acc:thr'),
  NULL,
  'parser rejects an unknown channel prefix'
);
SELECT is(
  public.kinetiks_realtime_channel_account('presence:acc'),
  NULL,
  'parser rejects a topic with too few segments'
);
SELECT is(
  public.kinetiks_realtime_channel_account('presence:acc:thr:extra'),
  NULL,
  'parser rejects a topic with too many segments'
);
SELECT is(
  public.kinetiks_realtime_channel_account('presence::thr'),
  NULL,
  'parser rejects an empty account segment'
);

-- ── ownership predicate, evaluated as alice (claim branch) ──
SELECT _kt_test_set_auth_user(
  '11111111-1111-1111-1111-111111111111',
  (SELECT alice FROM _rt_acct)
);

SELECT ok(
  public.kinetiks_realtime_topic_owned('presence:' || (SELECT alice FROM _rt_acct) || ':thr-1'),
  'alice owns her own presence topic'
);
SELECT ok(
  public.kinetiks_realtime_topic_owned('annotations:' || (SELECT alice FROM _rt_acct) || ':thr-1'),
  'alice owns her own annotations topic'
);
SELECT ok(
  public.kinetiks_realtime_topic_owned('workspace:' || (SELECT alice FROM _rt_acct) || ':thr-1'),
  'alice owns her own workspace topic'
);
SELECT ok(
  NOT public.kinetiks_realtime_topic_owned('presence:' || (SELECT bob FROM _rt_acct) || ':thr-1'),
  'alice does NOT own bob''s presence topic (cross-account boundary)'
);
SELECT ok(
  NOT public.kinetiks_realtime_topic_owned('mystery:' || (SELECT alice FROM _rt_acct) || ':thr-1'),
  'a non-collaborative prefix is never owned, even on alice''s own account id'
);
SELECT ok(
  NOT public.kinetiks_realtime_topic_owned(NULL),
  'a null topic is denied (definite false, not null)'
);

SELECT _kt_test_clear_auth();

-- ── policies are actually wired on realtime.messages ────────
SELECT is(
  (SELECT count(*)::int FROM pg_policies
     WHERE schemaname = 'realtime' AND tablename = 'messages'
       AND policyname IN (
         'Account owns collaborative topic (receive)',
         'Account owns collaborative topic (broadcast)'
       )),
  2,
  'both realtime.messages RLS policies (receive + broadcast) exist'
);
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'realtime.messages'::regclass),
  true,
  'RLS is enabled on realtime.messages'
);

SELECT * FROM finish();
ROLLBACK;
