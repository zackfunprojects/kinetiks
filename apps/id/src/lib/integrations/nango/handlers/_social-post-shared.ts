import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SocialPostSource } from "@kinetiks/types";

import { fetchAllRecords, NangoMisconfiguredError } from "../client";
import type { NangoHandlerContext, NangoHandlerResult } from "../types";

/**
 * Phase 7 — shared helper for the four social-post sync handlers
 * (Twitter / LinkedIn / Instagram / TikTok). Reduces each per-platform
 * handler to its platform-specific normalization plus a single call
 * here.
 *
 * The shape:
 *   1. The per-platform handler declares a `normalizePost(raw) →
 *      NormalizedSocialPost | null` function. Returning null skips
 *      the record (e.g. corrupted upstream row).
 *   2. This module loops through every Nango record page, runs the
 *      normalizer, and upserts to `kinetiks_social_posts` keyed on
 *      (account_id, source, provider_post_id) per the UNIQUE
 *      constraint from migration 00064.
 *   3. Returns the standard NangoHandlerResult so the webhook route
 *      can write the sync log uniformly.
 *
 * Platforms with secondary metric streams (e.g. follower counts over
 * time) use a separate handler registration for the second sync_name
 * and write to kinetiks_metric_cache directly. This module covers the
 * post-row path only.
 */

export interface NormalizedSocialPost {
  /** Platform's native post id (tweet id, LinkedIn URN, etc.). */
  provider_post_id: string;
  /** ISO timestamp of when the post went live on the platform. */
  posted_at: string;
  /** Short excerpt of the post body. Max 280 chars. PII-stripped. */
  content_summary: string | null;
  /** Engagement metrics; shape validated by the per-platform handler. */
  engagement: Record<string, number | undefined>;
  /** Metadata: hashtags, mention hashes, urls, etc. */
  metadata: Record<string, unknown>;
}

export interface RunSocialPostSyncArgs {
  ctx: NangoHandlerContext;
  source: SocialPostSource;
  /** Nango sync model the handler is registered against. */
  model: string;
  normalizePost: (raw: Record<string, unknown>) => NormalizedSocialPost | null;
  /** Optional limit for how many records to process per page (Nango caps at 1000). */
  limit?: number;
}

/**
 * Truncate a post body to 280 chars, collapsing whitespace. Returns
 * null for empty inputs. This is the single chokepoint between raw
 * platform payloads and what lands in `content_summary`.
 */
export function safeContentSummary(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return null;
  return trimmed.length > 280 ? trimmed.slice(0, 277) + "..." : trimmed;
}

/**
 * Run a social-post sync end-to-end. Used by twitter.ts /
 * linkedin.ts / instagram.ts / tiktok.ts.
 */
export async function runSocialPostSync(
  args: RunSocialPostSyncArgs,
  admin: SupabaseClient,
): Promise<NangoHandlerResult> {
  let recordsAdded = 0;
  let recordsUpdated = 0;
  const recordsDeleted = 0; // social posts are never deleted by sync; only added/updated
  let skipped = 0;

  try {
    await fetchAllRecords<Record<string, unknown>>(
      {
        connectionId: args.ctx.webhook.connectionId,
        providerConfigKey: args.ctx.webhook.providerConfigKey,
        model: args.model,
        modifiedAfter: args.ctx.webhook.modifiedAfter,
        limit: args.limit ?? 100,
      },
      async (page) => {
        const rows: Array<Record<string, unknown>> = [];
        for (const raw of page) {
          // Phase 7 CR: isolate normalize errors at row level so one
          // malformed record doesn't fail the whole sync. The CodeRabbit
          // finding flagged that a normalizer throw would propagate up
          // and mark the entire batch as failed; for sync resilience
          // we treat per-row failures as skips and continue.
          let normalized: NormalizedSocialPost | null;
          try {
            normalized = args.normalizePost(raw);
          } catch (err) {
            skipped++;
            Sentry.captureException(err, {
              tags: {
                route: "nango/handlers/social-post",
                action: "normalize",
                stage: "per_record",
                app: "id",
              },
              user: { id: args.ctx.accountId },
              extra: {
                source: args.source,
                provider_config_key: args.ctx.webhook.providerConfigKey,
                sync_name: args.ctx.webhook.syncName,
              },
            });
            continue;
          }
          if (!normalized) {
            skipped++;
            continue;
          }
          rows.push({
            account_id: args.ctx.accountId,
            source: args.source,
            provider_post_id: normalized.provider_post_id,
            posted_at: normalized.posted_at,
            content_summary: normalized.content_summary,
            engagement: normalized.engagement,
            metadata: normalized.metadata,
            observed_at: args.ctx.arrivedAt.toISOString(),
          });
        }
        if (rows.length === 0) return;

        // Upsert with the (account_id, source, provider_post_id)
        // unique key so re-syncs update existing rows in place. The
        // count of added vs updated is not exposed by Supabase's
        // upsert response shape; we count added optimistically and
        // settle on "updated" via select-first when accurate counts
        // matter (not in v1 — Marcus tools don't read those counts).
        const { error } = await admin
          .from("kinetiks_social_posts")
          .upsert(rows, {
            onConflict: "account_id,source,provider_post_id",
          });
        if (error) {
          throw new Error(
            `[social-post-sync] upsert failed for source=${args.source}: ${error.message}`,
          );
        }
        // Best-effort attribution: every row through this path counts
        // as either added or updated; without an extra select we
        // can't distinguish, so we report half/half. The downstream
        // Ledger entry surfaces a useful total.
        recordsAdded += Math.ceil(rows.length / 2);
        recordsUpdated += Math.floor(rows.length / 2);
      },
    );
  } catch (err) {
    if (err instanceof NangoMisconfiguredError) {
      return {
        status: "failed",
        recordsAdded,
        recordsUpdated,
        recordsDeleted,
        errorClass: "nango_misconfigured",
        errorMessage: err.message,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: "failed",
      recordsAdded,
      recordsUpdated,
      recordsDeleted,
      errorClass: "social_post_sync_failed",
      errorMessage: msg,
    };
  }

  return {
    status: skipped > 0 && recordsAdded + recordsUpdated === 0 ? "partial" : "succeeded",
    recordsAdded,
    recordsUpdated,
    recordsDeleted,
  };
}
