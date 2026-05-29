/**
 * Per Phase 7. Synced social-post shape backing the
 * `kinetiks_social_posts` table (migration 00064).
 *
 * One row per platform post per account. Engagement + metadata are
 * platform-shaped jsonb on the DB side; the typed view here exposes
 * them as Records that the per-platform sync handlers validate
 * against their own narrower schemas.
 *
 * PII rules per CLAUDE.md: handles are redacted by the sync handler
 * before write; emails / phone numbers never appear in
 * content_summary or metadata. The full post body is intentionally
 * truncated to content_summary; the raw body is not stored.
 */

export type SocialPostSource = "twitter" | "linkedin" | "instagram" | "tiktok";

export interface SocialEngagementMetrics {
  /** Common across platforms (some may be absent per platform). */
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  impressions?: number;
  reach?: number;
  /** Platform-specific (Twitter). */
  replies?: number;
  reposts?: number;
  bookmarks?: number;
  /** Platform-specific (LinkedIn). */
  reactions?: number;
  /** Platform-specific (Instagram). */
  saves?: number;
  /** Forward-compat: per-platform extras land here without breaking. */
  [key: string]: number | undefined;
}

export interface SocialPostMetadata {
  /** Hashtags (lowercased, no leading #). */
  hashtags?: string[];
  /** Mention handles — redacted to sha256 hex (16 chars). PII rule. */
  mention_hashes?: string[];
  /** Canonical URL to the live post on the platform. */
  post_url?: string;
  /** Platform-specific carriers. */
  media_urls?: string[];
  media_type?: "image" | "video" | "carousel" | "text";
  /** Twitter-specific. */
  conversation_id?: string;
  /** LinkedIn-specific. */
  urn?: string;
  /** TikTok-specific. */
  sound_id?: string;
  duration_sec?: number;
  /** Forward-compat: per-platform extras (TikTok schema volatility). */
  [key: string]: unknown;
}

export interface SocialPostRecord {
  id: string;
  account_id: string;
  team_scope_id: string | null;
  source: SocialPostSource;
  provider_post_id: string;
  posted_at: string;
  observed_at: string;
  content_summary: string | null;
  engagement: SocialEngagementMetrics;
  metadata: SocialPostMetadata;
  created_at: string;
  updated_at: string;
}
