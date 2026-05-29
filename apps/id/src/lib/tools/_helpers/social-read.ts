import "server-only";

import { z } from "zod";
import { defineTool, type AgentTool } from "@kinetiks/tools";

import type { SocialPostSource } from "@kinetiks/types";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Phase 7 — shared factory for the four social-post Marcus tools
 * (twitter_query, linkedin_query, instagram_query, tiktok_query).
 *
 * Each per-platform tool is a 30-line file that calls
 * `defineSocialReadTool({ source, ... })` and exports the result.
 * The factory handles:
 *   - Standard input schema (time window, top_n, min_engagement)
 *   - Standard output schema (total_posts, top_posts, hashtags)
 *   - Connection lookup (returns `not_connected` if no active row)
 *   - SQL query (Supabase admin client, RLS bypass for service-role)
 *   - Engagement primary metric extraction per platform
 *
 * The per-tool description, source, and engagement-primary-metric
 * extractor are the only parts that differ across the four tools.
 */

const TimeWindow = z.enum(["last_7_days", "last_28_days", "last_90_days"]);
type TimeWindowKey = z.infer<typeof TimeWindow>;

const Input = z.object({
  time_window: TimeWindow.default("last_28_days"),
  top_n: z.number().int().min(1).max(20).default(5),
  /** Hide posts whose primary engagement metric is below this threshold. */
  min_engagement: z.number().int().nonnegative().optional(),
});

const TopPost = z.object({
  posted_at: z.string(),
  content_summary: z.string().nullable(),
  primary_metric_name: z.string(),
  primary_metric_value: z.number(),
  hashtags: z.array(z.string()),
  post_url: z.string().nullable(),
});

const Output = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    source: z.string(),
    time_window: TimeWindow,
    total_posts: z.number().int().nonnegative(),
    total_primary_engagement: z.number().nonnegative(),
    average_primary_engagement: z.number().nonnegative(),
    top_posts: z.array(TopPost),
    top_hashtags: z.array(
      z.object({ tag: z.string(), uses: z.number().int().positive() }),
    ),
    /**
     * Set to true when zero posts matched. Distinguishes "connected
     * but never posted" from "connected with old posts (outside the
     * window)" — Marcus interprets both cases in plain language.
     */
    empty_window: z.boolean(),
  }),
  z.object({
    status: z.literal("not_connected"),
    source: z.string(),
    message: z.string(),
  }),
  z.object({
    status: z.literal("error"),
    source: z.string(),
    message: z.string(),
  }),
]);

export interface SocialReadToolConfig {
  /** Tool name in the registry, e.g. "twitter_query". */
  name: string;
  /** LLM-readable description (per Phase 4 customer-language rules). */
  description: string;
  /** kinetiks_social_posts.source filter. */
  source: SocialPostSource;
  /** Kinetiks ConnectionProvider for the not_connected check. */
  provider: string;
  /** Cortex layer attribution per Phase 1.7.1 connection_evidence. */
  cortex_layer: string;
  /** Connection-provider attribution per Phase 1.7.1. */
  connection_provider: string;
  /**
   * Which engagement metric to rank by for `top_posts`. Twitter:
   * "impressions" or "likes". LinkedIn: "reactions". Instagram:
   * "likes". TikTok: "views". Falls back to first numeric value
   * if the named metric is absent.
   */
  primary_metric: string;
}

function windowStart(window: TimeWindowKey, now: Date): string {
  const days = window === "last_7_days" ? 7 : window === "last_28_days" ? 28 : 90;
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days);
  return start.toISOString();
}

function pickPrimaryMetric(
  engagement: Record<string, unknown>,
  primaryMetric: string,
): number {
  const v = engagement[primaryMetric];
  if (typeof v === "number") return v;
  // Fallback: first numeric value in declaration order.
  for (const value of Object.values(engagement)) {
    if (typeof value === "number") return value;
  }
  return 0;
}

export function defineSocialReadTool(
  config: SocialReadToolConfig,
): AgentTool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return defineTool({
    name: config.name,
    description: config.description,
    inputSchema: Input,
    outputSchema: Output,
    isConsequential: false,
    autoApproveThreshold: null,
    availability: {
      kind: "connection_required",
      provider: config.provider,
    },
    connection_provider: config.connection_provider,
    cortex_layer: config.cortex_layer,
    execute: async (input, ctx) => {
      const admin = createAdminClient();

      // Connection check. The availability predicate gates at
      // ToolRegistry boot, but a not-active connection (revoked /
      // pending) should yield a structured not_connected response,
      // not a tool-execute crash.
      const { data: conn } = await admin
        .from("kinetiks_connections")
        .select("status")
        .eq("account_id", ctx.accountId)
        .eq("provider", config.provider)
        .eq("status", "active")
        .maybeSingle();
      if (!conn) {
        return {
          status: "not_connected" as const,
          source: config.source,
          message: `${config.source} is not connected. Connect it in the dashboard to start querying.`,
        };
      }

      const now = new Date();
      const start = windowStart(input.time_window, now);

      const { data: posts, error } = await admin
        .from("kinetiks_social_posts")
        .select("posted_at, content_summary, engagement, metadata")
        .eq("account_id", ctx.accountId)
        .eq("source", config.source)
        .gte("posted_at", start)
        .order("posted_at", { ascending: false })
        .limit(500);
      if (error) {
        console.error(
          `[${config.name}] query failed: ${error.message}`,
        );
        return {
          status: "error" as const,
          source: config.source,
          message: "Couldn't read your posts right now. Try again in a moment.",
        };
      }

      if (!posts || posts.length === 0) {
        return {
          status: "ok" as const,
          source: config.source,
          time_window: input.time_window,
          total_posts: 0,
          total_primary_engagement: 0,
          average_primary_engagement: 0,
          top_posts: [],
          top_hashtags: [],
          empty_window: true,
        };
      }

      const minE = input.min_engagement ?? 0;
      const filtered = posts
        .map((p) => {
          const engagement = (p.engagement as Record<string, unknown>) ?? {};
          const metadata = (p.metadata as Record<string, unknown>) ?? {};
          const primary = pickPrimaryMetric(engagement, config.primary_metric);
          return {
            posted_at: p.posted_at as string,
            content_summary: (p.content_summary as string | null) ?? null,
            primary_metric_name: config.primary_metric,
            primary_metric_value: primary,
            hashtags: Array.isArray(metadata.hashtags) ? (metadata.hashtags as string[]) : [],
            post_url:
              typeof metadata.post_url === "string"
                ? (metadata.post_url as string)
                : null,
          };
        })
        .filter((p) => p.primary_metric_value >= minE);

      const totalE = filtered.reduce((sum, p) => sum + p.primary_metric_value, 0);
      const avgE = filtered.length > 0 ? totalE / filtered.length : 0;

      const topPosts = [...filtered]
        .sort((a, b) => b.primary_metric_value - a.primary_metric_value)
        .slice(0, input.top_n);

      // Top hashtag aggregation
      const hashCounts = new Map<string, number>();
      for (const p of filtered) {
        for (const h of p.hashtags) {
          hashCounts.set(h, (hashCounts.get(h) ?? 0) + 1);
        }
      }
      const topHashtags = Array.from(hashCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag, uses]) => ({ tag, uses }));

      return {
        status: "ok" as const,
        source: config.source,
        time_window: input.time_window,
        total_posts: filtered.length,
        total_primary_engagement: totalE,
        average_primary_engagement: Math.round(avgE * 100) / 100,
        top_posts: topPosts,
        top_hashtags: topHashtags,
        empty_window: false,
      };
    },
  });
}
