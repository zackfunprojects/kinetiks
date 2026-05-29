/**
 * Nango sync handler — X / Twitter.
 *
 * Phase 7 — two sync_names registered:
 *
 *   - twitter-recent-posts  → kinetiks_social_posts (source='twitter')
 *   - twitter-profile-stats → kinetiks_metric_cache (followers, total_likes)
 *
 * Twitter free-tier API throttling is real; the partial-success path
 * in `_social-post-shared.ts` tolerates pages that return fewer than
 * the limit. Subsequent scheduled syncs catch up.
 *
 * PII rules: tweet body is truncated to 280 chars (Twitter native cap
 * anyway) and stored in content_summary. Mention handles ("@foo")
 * are sha256-hashed to 16 hex chars in metadata.mention_hashes —
 * Marcus can detect "same handle across posts" without storing it.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { hashHandle } from "../pii";
import { writeCachedMetric } from "@/lib/connections/metric-cache";
import { fetchAllRecords, NangoMisconfiguredError } from "../client";
import { registerNangoHandler } from ".";
import type { NangoHandlerFn, NangoHandlerResult } from "../types";
import {
  runSocialPostSync,
  safeContentSummary,
  type NormalizedSocialPost,
} from "./_social-post-shared";

const PROVIDER_CONFIG_KEY = "twitter";

// ─── twitter-recent-posts ───────────────────────────────────

interface RawTwitterTweet {
  id?: string;
  text?: string;
  created_at?: string;
  public_metrics?: {
    like_count?: number;
    reply_count?: number;
    retweet_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    impression_count?: number;
  };
  entities?: {
    hashtags?: Array<{ tag?: string }>;
    mentions?: Array<{ username?: string }>;
  };
  conversation_id?: string;
}

function normalizeTwitterTweet(raw: Record<string, unknown>): NormalizedSocialPost | null {
  const r = raw as RawTwitterTweet;
  if (!r.id || !r.created_at) return null;
  const hashtags =
    r.entities?.hashtags
      ?.map((h) => h.tag?.toLowerCase())
      .filter((t): t is string => typeof t === "string" && t.length > 0) ?? [];
  const mentions =
    r.entities?.mentions
      ?.map((m) => hashHandle(m.username ?? null))
      .filter((h): h is string => typeof h === "string") ?? [];
  return {
    provider_post_id: r.id,
    posted_at: new Date(r.created_at).toISOString(),
    content_summary: safeContentSummary(r.text),
    engagement: {
      likes: r.public_metrics?.like_count ?? 0,
      replies: r.public_metrics?.reply_count ?? 0,
      reposts: r.public_metrics?.retweet_count ?? 0,
      quotes: r.public_metrics?.quote_count ?? 0,
      bookmarks: r.public_metrics?.bookmark_count ?? 0,
      impressions: r.public_metrics?.impression_count ?? 0,
    },
    metadata: {
      hashtags,
      mention_hashes: mentions,
      conversation_id: r.conversation_id ?? null,
      post_url: `https://twitter.com/i/web/status/${r.id}`,
    },
  };
}

const twitterRecentPostsHandler: NangoHandlerFn = async (ctx) => {
  const admin = createAdminClient();
  return runSocialPostSync(
    {
      ctx,
      source: "twitter",
      model: "Tweet",
      normalizePost: normalizeTwitterTweet,
    },
    admin,
  );
};

// ─── twitter-profile-stats ──────────────────────────────────

interface RawTwitterProfileStats {
  date?: string;
  user_id?: string;
  followers_count?: number;
  following_count?: number;
  tweet_count?: number;
}

const twitterProfileStatsHandler: NangoHandlerFn = async (ctx) => {
  const admin = createAdminClient();
  const today = new Date();
  let recordsAdded = 0;
  try {
    await fetchAllRecords<RawTwitterProfileStats>(
      {
        connectionId: ctx.webhook.connectionId,
        providerConfigKey: ctx.webhook.providerConfigKey,
        model: "ProfileStats",
        modifiedAfter: ctx.webhook.modifiedAfter,
      },
      async (page) => {
        for (const r of page) {
          if (typeof r.followers_count !== "number") continue;
          const date = r.date ?? today.toISOString().slice(0, 10);
          // Followers + total tweet count emit as two separate cache
          // rows so the Marcus tool can read each metric independently.
          // 6h stale-after — followers trend slowly; we don't need
          // sub-hour freshness.
          await writeCachedMetric(admin, {
            account_id: ctx.accountId,
            source: "twitter",
            input: { metric: "twitter_followers", date, dimension: "overall" },
            response: {
              metric: "twitter_followers",
              unit: "count",
              value: r.followers_count,
              date_range: { start: date, end: date },
            },
            stale_after_seconds: 6 * 60 * 60,
          });
          if (typeof r.tweet_count === "number") {
            await writeCachedMetric(admin, {
              account_id: ctx.accountId,
              source: "twitter",
              input: { metric: "twitter_tweet_count", date, dimension: "overall" },
              response: {
                metric: "twitter_tweet_count",
                unit: "count",
                value: r.tweet_count,
                date_range: { start: date, end: date },
              },
              stale_after_seconds: 6 * 60 * 60,
            });
          }
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
      errorClass: "twitter_profile_stats_failed",
      errorMessage: msg,
    };
  }
  return { status: "succeeded", recordsAdded, recordsUpdated: 0, recordsDeleted: 0 };
};

// ─── Registrations ──────────────────────────────────────────

registerNangoHandler({
  providerConfigKey: PROVIDER_CONFIG_KEY,
  syncName: "twitter-recent-posts",
  handler: twitterRecentPostsHandler,
});
registerNangoHandler({
  providerConfigKey: PROVIDER_CONFIG_KEY,
  syncName: "twitter-profile-stats",
  handler: twitterProfileStatsHandler,
});

// Exported for tests
export { normalizeTwitterTweet, twitterRecentPostsHandler, twitterProfileStatsHandler };
