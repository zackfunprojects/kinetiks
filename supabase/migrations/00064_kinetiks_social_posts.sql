-- ============================================================
-- 00064_kinetiks_social_posts.sql
--
-- Phase 7 — new table for synced social posts from Twitter,
-- LinkedIn, Instagram, and TikTok via Nango. Mirror of the existing
-- kinetiks_crm_entities table for CRM data, structured for the
-- short-form-social shape where every row is a post:
--
--   - source: which platform produced this post
--   - provider_post_id: the platform's native identifier (tweet id,
--     LinkedIn URN, Instagram media id, TikTok video id)
--   - content_summary: short excerpt (≤ 280 chars); the full post
--     body is intentionally not stored to keep PII surface small
--   - engagement: jsonb { likes, comments, replies, shares, reposts,
--     views, impressions, ... } — platform-shaped, validated by
--     each sync handler against its own schema
--   - metadata: jsonb { hashtags, mentions (handles redacted),
--     media_urls, post_url, sound_id (TikTok), ... } — variable shape
--
-- Per CLAUDE.md PII rules: handles, emails, and free-text comments
-- never land here. The sync handlers strip them at write time.
--
-- The Marcus read tools (twitter_query, linkedin_query,
-- instagram_query, tiktok_query) read this table filtered by
-- (account_id, source). The shared factory at
-- apps/id/src/lib/tools/_helpers/social-read.ts builds each per-
-- source tool from a single template.
--
-- TikTok is the most volatile platform schema; the tiktok handler
-- in particular uses metadata jsonb as the catch-all for unknown
-- fields so a quarterly TikTok API drift cannot break the sync.
-- ============================================================

CREATE TABLE IF NOT EXISTS kinetiks_social_posts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  team_scope_id     text,                  -- v2 multi-user placeholder per CLAUDE.md

  -- Identity
  source            text NOT NULL
                    CHECK (source IN ('twitter','linkedin','instagram','tiktok')),
  provider_post_id  text NOT NULL,

  -- Time
  posted_at         timestamptz NOT NULL,  -- when the post went live on the platform
  observed_at       timestamptz NOT NULL DEFAULT now(), -- when we last refreshed it

  -- Payload (handler-validated)
  content_summary   text,                  -- ≤ 280 chars; full body NOT stored
  engagement        jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- A given platform's post appears at most once per account
  UNIQUE (account_id, source, provider_post_id),

  -- Defensive: engagement + metadata must be objects (never strings or arrays)
  CHECK (jsonb_typeof(engagement) = 'object'),
  CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE kinetiks_social_posts IS
  'Phase 7: per-account synced social posts from Nango. One row per platform post per account. Writes are service-role only (sync webhook handlers); user tokens have SELECT only. Engagement + metadata are platform-shaped jsonb validated by per-source handlers in apps/id/src/lib/integrations/nango/handlers/.';

COMMENT ON COLUMN kinetiks_social_posts.content_summary IS
  'Short excerpt of the post body (max ~280 chars). The full body is intentionally NOT stored to keep PII surface small. For posts whose body itself is PII (e.g. a DM-style post — rare), the sync handler may write null here.';

COMMENT ON COLUMN kinetiks_social_posts.engagement IS
  'Per-platform engagement metrics. Twitter: { likes, replies, reposts, impressions, bookmarks }. LinkedIn: { reactions, comments, shares, impressions }. Instagram: { likes, comments, saves, reach, impressions }. TikTok: { views, likes, comments, shares }. Each handler validates the shape against its declared schema.';

COMMENT ON COLUMN kinetiks_social_posts.metadata IS
  'Per-platform metadata. Hashtags, mentions (handles redacted), post_url, media_urls. Twitter: { hashtags, mentions, conversation_id }. LinkedIn: { hashtags, mentions, urn }. Instagram: { hashtags, media_type, media_url }. TikTok: { hashtags, sound_id, duration_sec, plus catch-all for unknown fields per the TikTok schema-volatility mitigation }.';

-- ── Indexes ─────────────────────────────────────────────────
-- Per-account time-range queries: "what did I post in the last 7 days?"
CREATE INDEX IF NOT EXISTS idx_social_posts_account_source_posted
  ON kinetiks_social_posts (account_id, source, posted_at DESC);

-- Cross-source recent activity: "what was my most recent post on any platform?"
CREATE INDEX IF NOT EXISTS idx_social_posts_account_posted
  ON kinetiks_social_posts (account_id, posted_at DESC);

-- jsonb containment for engagement filtering: "show me posts with > 1000 likes"
-- via @> '{"likes": ...}' (the Marcus tool uses an explicit threshold predicate).
CREATE INDEX IF NOT EXISTS idx_social_posts_engagement_gin
  ON kinetiks_social_posts USING gin (engagement jsonb_path_ops);

-- ── updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION _kt_social_posts_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS social_posts_touch_updated_at ON kinetiks_social_posts;
CREATE TRIGGER social_posts_touch_updated_at
  BEFORE UPDATE ON kinetiks_social_posts
  FOR EACH ROW
  EXECUTE FUNCTION _kt_social_posts_touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
-- Same pattern as kinetiks_crm_entities + kinetiks_authority_grants:
-- account-scoped SELECT; default-deny on INSERT/UPDATE/DELETE so
-- only service-role (sync webhook handlers) may mutate.
ALTER TABLE kinetiks_social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own social posts"
  ON kinetiks_social_posts
  FOR SELECT
  USING (
    account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())
  );
-- No INSERT/UPDATE/DELETE policies: service-role only.
