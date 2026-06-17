-- ============================================================
-- 00091_realtime_authorization.sql
--
-- Phase 8.8 — Realtime Authorization for the collaborative broadcast channels
-- (collaborative-workspace-spec §12; plan D4 + phase-8.8 D1).
--
-- The program's SEND-side boundary is publishAccountScoped() (packages/supabase/
-- src/realtime.ts): it refuses to broadcast on a channel whose `:{account}:`
-- segment is not the caller's. This migration adds the SUBSCRIBE-side boundary
-- the spec names — RLS on realtime.messages — so that a *private* collaborative
-- channel only delivers to, and only accepts broadcasts from, the account that
-- owns the topic.
--
-- SCOPE / SAFETY: realtime.messages RLS governs PRIVATE channels only
-- (channels created with `config: { private: true }`). Public broadcast channels
-- and postgres_changes subscriptions never consult these policies. realtime.messages
-- already has RLS enabled with NO policies today (verified: relrowsecurity = t,
-- zero policies), which means private channels are currently fully default-denied
-- and there is no private-channel usage to regress. These two policies are
-- therefore purely additive: they OPEN private collaborative topics to their
-- owning account and nothing else. The presence/workspace channels opt into
-- `private: true` in the client wiring that ships with this migration; all other
-- realtime usage (the postgres_changes channels for annotations/approvals/etc.,
-- and any remaining public broadcast) is untouched.
--
-- TESTABILITY: the ownership decision lives in a public-schema SQL function the
-- policy wraps, so pgTAP exercises the exact predicate (supabase/tests/
-- realtime_channel_boundary.sql) without depending on the realtime.topic() GUC
-- or realtime.messages grants.
-- ============================================================

-- ── topic → account segment parser (mirrors channelAccountId in TS) ─────
-- Collaborative channels are exactly `prefix:account:thread`. Anything else
-- (wrong segment count, unknown prefix, empty account) yields null → not a
-- collaborative topic → the ownership predicate denies it.
CREATE OR REPLACE FUNCTION public.kinetiks_realtime_channel_account(p_topic text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_topic IS NULL THEN NULL
    WHEN array_length(string_to_array(p_topic, ':'), 1) <> 3 THEN NULL
    WHEN (string_to_array(p_topic, ':'))[1]
         NOT IN ('presence', 'annotations', 'workspace') THEN NULL
    ELSE nullif((string_to_array(p_topic, ':'))[2], '')
  END;
$$;

COMMENT ON FUNCTION public.kinetiks_realtime_channel_account(text) IS
  'Parses the account_id segment out of a collaborative Realtime topic '
  '(`prefix:account:thread`, prefix in presence|annotations|workspace). Returns '
  'null for any non-collaborative or malformed topic. Mirrors channelAccountId() '
  'in packages/supabase/src/realtime.ts. Used by the realtime.messages RLS policy.';

-- ── ownership predicate the policy wraps ────────────────────────────────
-- True iff the topic is a collaborative topic whose account segment equals the
-- caller's resolved account. SECURITY INVOKER so kinetiks_account_id() resolves
-- against the caller's JWT exactly as in every other account-scoped policy.
CREATE OR REPLACE FUNCTION public.kinetiks_realtime_topic_owned(p_topic text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  -- coalesce → always a definite boolean: a null account segment, a null
  -- resolved account, or a non-collaborative/malformed topic all deny (false),
  -- never a null that a reader might mishandle.
  SELECT coalesce(
    public.kinetiks_realtime_channel_account(p_topic)
      = (SELECT public.kinetiks_account_id())::text,
    false
  );
$$;

COMMENT ON FUNCTION public.kinetiks_realtime_topic_owned(text) IS
  'Realtime Authorization predicate (spec §12): true iff p_topic is a '
  'collaborative channel owned by the caller''s account. Returns false (deny) for '
  'foreign-account topics, malformed topics, and non-collaborative topics. Wrapped '
  'by the realtime.messages RLS policies; governs private channels only.';

GRANT EXECUTE ON FUNCTION public.kinetiks_realtime_channel_account(text)
  TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.kinetiks_realtime_topic_owned(text)
  TO authenticated, anon, service_role;

-- ── RLS policies on realtime.messages (private channels only) ───────────
-- Guarded so the migration is a no-op on any environment lacking the realtime
-- broadcast substrate (the function is Supabase-managed; present on every real
-- project and the local CLI stack). RLS is already enabled on the table; the
-- ENABLE is idempotent insurance.
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL
     AND to_regprocedure('realtime.topic()') IS NOT NULL THEN

    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';

    -- Receive (subscribe): only deliver collaborative messages on a topic the
    -- account owns.
    EXECUTE 'DROP POLICY IF EXISTS "Account owns collaborative topic (receive)" ON realtime.messages';
    EXECUTE $p$
      CREATE POLICY "Account owns collaborative topic (receive)"
        ON realtime.messages
        FOR SELECT
        TO authenticated
        USING (public.kinetiks_realtime_topic_owned((SELECT realtime.topic())))
    $p$;

    -- Broadcast (send): only accept collaborative messages on a topic the
    -- account owns (belt-and-suspenders with publishAccountScoped on the client).
    EXECUTE 'DROP POLICY IF EXISTS "Account owns collaborative topic (broadcast)" ON realtime.messages';
    EXECUTE $p$
      CREATE POLICY "Account owns collaborative topic (broadcast)"
        ON realtime.messages
        FOR INSERT
        TO authenticated
        WITH CHECK (public.kinetiks_realtime_topic_owned((SELECT realtime.topic())))
    $p$;
  END IF;
END $$;
