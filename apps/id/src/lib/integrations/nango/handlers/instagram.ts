/**
 * Nango sync handler — Instagram (Business / Creator accounts).
 *
 * Phase 7 — two sync_names registered:
 *
 *   - instagram-media    → kinetiks_social_posts (source='instagram')
 *   - instagram-insights → kinetiks_metric_cache (followers, reach, profile views)
 *
 * Personal Instagram accounts are NOT supported (Meta's Graph API
 * restriction). Customers must connect a Business or Creator account.
 * The Nango integration_id "instagram-business" reflects this.
 *
 * PII rules: caption truncated to 280 chars; mention handles
 * redacted via hashHandle; full media URLs kept (they're public
 * platform URLs, not PII).
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

const PROVIDER_CONFIG_KEY = "instagram-business";

// ─── instagram-media ────────────────────────────────────────

type InstagramMediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REEL";

interface RawInstagramMedia {
  id?: string;
  caption?: string;
  media_type?: InstagramMediaType;
  media_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  insights?: {
    reach?: number;
    impressions?: number;
    saves?: number;
  };
}

const HASHTAG_RE = /#([\p{L}0-9_]+)/gu;
const MENTION_RE = /@([\p{L}0-9_.]+)/gu;

function extractHashtagsFromCaption(caption: string | undefined): string[] {
  if (!caption) return [];
  const out: string[] = [];
  for (const match of caption.matchAll(HASHTAG_RE)) {
    if (match[1]) out.push(match[1].toLowerCase());
  }
  return Array.from(new Set(out));
}

function extractMentionHashesFromCaption(caption: string | undefined): string[] {
  if (!caption) return [];
  const out: string[] = [];
  for (const match of caption.matchAll(MENTION_RE)) {
    const h = hashHandle(match[1]);
    if (h) out.push(h);
  }
  return Array.from(new Set(out));
}

function mapMediaType(t: InstagramMediaType | undefined): "image" | "video" | "carousel" | "text" {
  switch (t) {
    case "IMAGE":
      return "image";
    case "VIDEO":
    case "REEL":
      return "video";
    case "CAROUSEL_ALBUM":
      return "carousel";
    default:
      return "text";
  }
}

function normalizeInstagramMedia(raw: Record<string, unknown>): NormalizedSocialPost | null {
  const r = raw as RawInstagramMedia;
  if (!r.id || !r.timestamp) return null;
  return {
    provider_post_id: r.id,
    posted_at: new Date(r.timestamp).toISOString(),
    content_summary: safeContentSummary(r.caption),
    engagement: {
      likes: r.like_count ?? 0,
      comments: r.comments_count ?? 0,
      reach: r.insights?.reach ?? 0,
      impressions: r.insights?.impressions ?? 0,
      saves: r.insights?.saves ?? 0,
    },
    metadata: {
      hashtags: extractHashtagsFromCaption(r.caption),
      mention_hashes: extractMentionHashesFromCaption(r.caption),
      media_type: mapMediaType(r.media_type),
      media_urls: r.media_url ? [r.media_url] : [],
      post_url: r.permalink ?? null,
    },
  };
}

const instagramMediaHandler: NangoHandlerFn = async (ctx) => {
  const admin = createAdminClient();
  return runSocialPostSync(
    {
      ctx,
      source: "instagram",
      model: "Media",
      normalizePost: normalizeInstagramMedia,
    },
    admin,
  );
};

// ─── instagram-insights ─────────────────────────────────────

interface RawInstagramInsight {
  date?: string;
  metric_name?: string;
  value?: number;
}

// Map Instagram's metric_name to our canonical metric_name. Anything
// unrecognized is silently skipped — additive future metrics land
// safely without breaking the handler.
const INSIGHT_METRIC_MAP: Record<string, string> = {
  follower_count: "instagram_followers",
  reach: "instagram_reach",
  profile_views: "instagram_profile_views",
  impressions: "instagram_impressions",
  website_clicks: "instagram_website_clicks",
};

const instagramInsightsHandler: NangoHandlerFn = async (ctx) => {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  let recordsAdded = 0;
  try {
    await fetchAllRecords<RawInstagramInsight>(
      {
        connectionId: ctx.webhook.connectionId,
        providerConfigKey: ctx.webhook.providerConfigKey,
        model: "AccountInsight",
        modifiedAfter: ctx.webhook.modifiedAfter,
      },
      async (page) => {
        for (const r of page) {
          if (typeof r.value !== "number" || !r.metric_name) continue;
          const canonical = INSIGHT_METRIC_MAP[r.metric_name];
          if (!canonical) continue;
          const date = r.date ?? today;
          await writeCachedMetric(admin, {
            account_id: ctx.accountId,
            source: "instagram",
            input: { metric: canonical, date, dimension: "overall" },
            response: {
              metric: canonical,
              unit: "count",
              value: r.value,
              date_range: { start: date, end: date },
            },
            stale_after_seconds: 6 * 60 * 60,
          });
          recordsAdded++;
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
      errorClass: "instagram_insights_failed",
      errorMessage: msg,
    };
  }
  return { status: "succeeded", recordsAdded, recordsUpdated: 0, recordsDeleted: 0 };
};

// ─── Registrations ──────────────────────────────────────────

registerNangoHandler({
  providerConfigKey: PROVIDER_CONFIG_KEY,
  syncName: "instagram-media",
  handler: instagramMediaHandler,
});
registerNangoHandler({
  providerConfigKey: PROVIDER_CONFIG_KEY,
  syncName: "instagram-insights",
  handler: instagramInsightsHandler,
});

export {
  normalizeInstagramMedia,
  extractHashtagsFromCaption,
  extractMentionHashesFromCaption,
  instagramMediaHandler,
  instagramInsightsHandler,
};
