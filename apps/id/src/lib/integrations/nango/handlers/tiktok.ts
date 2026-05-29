/**
 * Nango sync handler — TikTok (Business API).
 *
 * Phase 7 — two sync_names registered:
 *
 *   - tiktok-videos        → kinetiks_social_posts (source='tiktok')
 *   - tiktok-account-stats → kinetiks_metric_cache (followers, total_likes, video_count)
 *
 * Defensive design: TikTok's Business API is the most volatile of
 * the 10 providers (schemas drift quarterly). The video normalizer
 * accepts unknown fields and lands them in `metadata` as-is rather
 * than failing the row. The insight metric map silently skips
 * unrecognized metric_name values so additive API changes don't
 * crash the sync.
 *
 * PII rules: caption → safeContentSummary (280 chars max); mention
 * handles → hashHandle; raw user_id stays out of metadata (the
 * customer's own user_id from their connected account is fine, but
 * mentions and authors of stitched-content tags are PII).
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { hashHandle } from "../pii";
import { writeCachedMetric } from "@/lib/connections/metric-cache";
import { fetchAllRecords, NangoMisconfiguredError } from "../client";
import { registerNangoHandler } from ".";
import type { NangoHandlerFn } from "../types";
import {
  runSocialPostSync,
  safeContentSummary,
  type NormalizedSocialPost,
} from "./_social-post-shared";

const PROVIDER_CONFIG_KEY = "tiktok";

// ─── tiktok-videos ──────────────────────────────────────────

interface RawTikTokVideo {
  id?: string;
  video_id?: string;
  create_time?: number | string;   // unix epoch seconds OR ISO
  title?: string;
  video_description?: string;
  caption?: string;
  duration?: number;
  music_id?: string;
  sound_id?: string;
  cover_image_url?: string;
  share_url?: string;
  embed_link?: string;
  // Engagement (TikTok's field names vary; defensive fallbacks)
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  // Any other field lands in metadata.extra via the catch-all below
  [extra: string]: unknown;
}

const KNOWN_FIELDS = new Set([
  "id", "video_id", "create_time", "title", "video_description", "caption",
  "duration", "music_id", "sound_id", "cover_image_url", "share_url",
  "embed_link", "view_count", "like_count", "comment_count", "share_count",
]);

function parseTikTokCreatedAt(value: number | string | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "number") {
    // TikTok returns seconds since epoch.
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  }
  return null;
}

function extractTikTokHashtags(text: string | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const match of text.matchAll(/#([\p{L}0-9_]+)/gu)) {
    if (match[1]) out.push(match[1].toLowerCase());
  }
  return Array.from(new Set(out));
}

function extractTikTokMentionHashes(text: string | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const match of text.matchAll(/@([\p{L}0-9_.]+)/gu)) {
    const h = hashHandle(match[1]);
    if (h) out.push(h);
  }
  return Array.from(new Set(out));
}

function normalizeTikTokVideo(raw: Record<string, unknown>): NormalizedSocialPost | null {
  const r = raw as RawTikTokVideo;
  const id = r.id ?? r.video_id;
  const posted = parseTikTokCreatedAt(r.create_time);
  if (!id || !posted) return null;
  const captionText = r.video_description ?? r.caption ?? r.title;

  // Defensive: catch any fields the schema gains in a quarterly
  // refresh. Unknown fields land in metadata.extra so the customer
  // record stays complete even when the typed normalization misses
  // them. The TikTok API has a habit of adding new aggregate fields
  // without notice.
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(r)) {
    if (!KNOWN_FIELDS.has(key) && key !== "_nango_metadata") {
      extra[key] = value;
    }
  }

  return {
    provider_post_id: id,
    posted_at: posted,
    content_summary: safeContentSummary(captionText),
    engagement: {
      views: r.view_count ?? 0,
      likes: r.like_count ?? 0,
      comments: r.comment_count ?? 0,
      shares: r.share_count ?? 0,
    },
    metadata: {
      hashtags: extractTikTokHashtags(captionText),
      mention_hashes: extractTikTokMentionHashes(captionText),
      sound_id: r.sound_id ?? r.music_id ?? null,
      duration_sec: r.duration ?? null,
      post_url: r.share_url ?? r.embed_link ?? null,
      media_urls: r.cover_image_url ? [r.cover_image_url] : [],
      media_type: "video",
      extra,
    },
  };
}

const tiktokVideosHandler: NangoHandlerFn = async (ctx) => {
  const admin = createAdminClient();
  return runSocialPostSync(
    {
      ctx,
      source: "tiktok",
      model: "Video",
      normalizePost: normalizeTikTokVideo,
    },
    admin,
  );
};

// ─── tiktok-account-stats ───────────────────────────────────

interface RawTikTokAccountStats {
  date?: string;
  user_id?: string;
  follower_count?: number;
  following_count?: number;
  total_likes?: number;
  total_video_count?: number;
  total_view_count?: number;
}

// Defensive metric map. Unknown TikTok field names are silently skipped.
const TIKTOK_METRIC_MAP: Array<{ from: keyof RawTikTokAccountStats; to: string }> = [
  { from: "follower_count", to: "tiktok_followers" },
  { from: "following_count", to: "tiktok_following" },
  { from: "total_likes", to: "tiktok_total_likes" },
  { from: "total_video_count", to: "tiktok_video_count" },
  { from: "total_view_count", to: "tiktok_total_views" },
];

const tiktokAccountStatsHandler: NangoHandlerFn = async (ctx) => {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  let recordsAdded = 0;
  try {
    await fetchAllRecords<RawTikTokAccountStats>(
      {
        connectionId: ctx.webhook.connectionId,
        providerConfigKey: ctx.webhook.providerConfigKey,
        model: "AccountStats",
        modifiedAfter: ctx.webhook.modifiedAfter,
      },
      async (page) => {
        for (const r of page) {
          const date = r.date ?? today;
          for (const { from, to } of TIKTOK_METRIC_MAP) {
            const v = r[from];
            if (typeof v !== "number") continue;
            await writeCachedMetric(admin, {
              account_id: ctx.accountId,
              source: "tiktok",
              input: { metric: to, date, dimension: "overall" },
              response: {
                metric: to,
                unit: "count",
                value: v,
                date_range: { start: date, end: date },
              },
              stale_after_seconds: 6 * 60 * 60,
            });
            recordsAdded++;
          }
        }
      },
    );
  } catch (err) {
    if (err instanceof NangoMisconfiguredError) {
      return {
        status: "failed",
        recordsAdded,
        recordsUpdated: 0,
        recordsDeleted: 0,
        errorClass: "nango_misconfigured",
        errorMessage: err.message,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: "failed",
      recordsAdded,
      recordsUpdated: 0,
      recordsDeleted: 0,
      errorClass: "tiktok_account_stats_failed",
      errorMessage: msg,
    };
  }
  return { status: "succeeded", recordsAdded, recordsUpdated: 0, recordsDeleted: 0 };
};

// ─── Registrations ──────────────────────────────────────────

registerNangoHandler({
  providerConfigKey: PROVIDER_CONFIG_KEY,
  syncName: "tiktok-videos",
  handler: tiktokVideosHandler,
});
registerNangoHandler({
  providerConfigKey: PROVIDER_CONFIG_KEY,
  syncName: "tiktok-account-stats",
  handler: tiktokAccountStatsHandler,
});

export {
  normalizeTikTokVideo,
  parseTikTokCreatedAt,
  extractTikTokHashtags,
  extractTikTokMentionHashes,
  tiktokVideosHandler,
  tiktokAccountStatsHandler,
};
