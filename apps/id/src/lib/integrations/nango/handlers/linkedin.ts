/**
 * Nango sync handler — LinkedIn.
 *
 * Phase 7 — two sync_names registered:
 *
 *   - linkedin-posts     → kinetiks_social_posts (source='linkedin')
 *   - linkedin-org-stats → kinetiks_metric_cache (followers, page_views)
 *
 * LinkedIn's API distinguishes personal posts ("ugcPosts") from company-
 * page shares; the normalizer accepts both, normalizing on the URN to
 * provider_post_id.
 *
 * PII rules: mention handles redacted to hashHandle(); body truncated
 * to 280 chars for content_summary; full author profile id is NOT
 * stored (organization id is OK — it's the customer's own org).
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

const PROVIDER_CONFIG_KEY = "linkedin";

// ─── linkedin-posts ─────────────────────────────────────────

interface RawLinkedInPost {
  id?: string;            // URN
  urn?: string;           // alternate
  created_at?: string;
  published_at?: string;
  commentary?: string;    // post text
  text?: string;          // alt field
  reactions_count?: number;
  comments_count?: number;
  shares_count?: number;
  impressions_count?: number;
  hashtags?: string[];
  mentions?: string[];    // array of handles
  organization_urn?: string;
}

function normalizeLinkedInPost(raw: Record<string, unknown>): NormalizedSocialPost | null {
  const r = raw as RawLinkedInPost;
  const id = r.id ?? r.urn;
  const posted = r.published_at ?? r.created_at;
  if (!id || !posted) return null;
  const hashtags =
    Array.isArray(r.hashtags)
      ? r.hashtags
          .map((h) => (typeof h === "string" ? h.toLowerCase().replace(/^#/, "") : null))
          .filter((h): h is string => Boolean(h))
      : [];
  const mentionHashes =
    Array.isArray(r.mentions)
      ? r.mentions
          .map((m) => hashHandle(typeof m === "string" ? m : null))
          .filter((h): h is string => Boolean(h))
      : [];
  return {
    provider_post_id: id,
    posted_at: new Date(posted).toISOString(),
    content_summary: safeContentSummary(r.commentary ?? r.text),
    engagement: {
      reactions: r.reactions_count ?? 0,
      comments: r.comments_count ?? 0,
      shares: r.shares_count ?? 0,
      impressions: r.impressions_count ?? 0,
    },
    metadata: {
      hashtags,
      mention_hashes: mentionHashes,
      urn: id,
      organization_urn: r.organization_urn ?? null,
    },
  };
}

const linkedinPostsHandler: NangoHandlerFn = async (ctx) => {
  const admin = createAdminClient();
  return runSocialPostSync(
    {
      ctx,
      source: "linkedin",
      model: "Post",
      normalizePost: normalizeLinkedInPost,
    },
    admin,
  );
};

// ─── linkedin-org-stats ─────────────────────────────────────

interface RawLinkedInOrgStats {
  date?: string;
  organization_urn?: string;
  follower_count?: number;
  page_views?: number;
  unique_visitors?: number;
}

const linkedinOrgStatsHandler: NangoHandlerFn = async (ctx) => {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  let recordsAdded = 0;
  try {
    await fetchAllRecords<RawLinkedInOrgStats>(
      {
        connectionId: ctx.webhook.connectionId,
        providerConfigKey: ctx.webhook.providerConfigKey,
        model: "OrganizationStats",
        modifiedAfter: ctx.webhook.modifiedAfter,
      },
      async (page) => {
        for (const r of page) {
          const date = r.date ?? today;
          if (typeof r.follower_count === "number") {
            await writeCachedMetric(admin, {
              account_id: ctx.accountId,
              source: "linkedin",
              input: { metric: "linkedin_followers", date, dimension: "overall" },
              response: {
                metric: "linkedin_followers",
                unit: "count",
                value: r.follower_count,
                date_range: { start: date, end: date },
              },
              stale_after_seconds: 6 * 60 * 60,
            });
            recordsAdded++;
          }
          if (typeof r.page_views === "number") {
            await writeCachedMetric(admin, {
              account_id: ctx.accountId,
              source: "linkedin",
              input: { metric: "linkedin_page_views", date, dimension: "overall" },
              response: {
                metric: "linkedin_page_views",
                unit: "count",
                value: r.page_views,
                date_range: { start: date, end: date },
              },
              stale_after_seconds: 6 * 60 * 60,
            });
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
      errorClass: "linkedin_org_stats_failed",
      errorMessage: msg,
    };
  }
  return { status: "succeeded", recordsAdded, recordsUpdated: 0, recordsDeleted: 0 };
};

// ─── Registrations ──────────────────────────────────────────

registerNangoHandler({
  providerConfigKey: PROVIDER_CONFIG_KEY,
  syncName: "linkedin-posts",
  handler: linkedinPostsHandler,
});
registerNangoHandler({
  providerConfigKey: PROVIDER_CONFIG_KEY,
  syncName: "linkedin-org-stats",
  handler: linkedinOrgStatsHandler,
});

export { normalizeLinkedInPost, linkedinPostsHandler, linkedinOrgStatsHandler };
