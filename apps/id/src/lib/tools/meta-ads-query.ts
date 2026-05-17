/**
 * meta_ads_query tool — Meta (Facebook + Instagram) Ads performance.
 *
 * Cache-backed reader. The webhook handler writes one cache row per
 * (metric, range, dimensions) bucket; this tool reads them.
 */

import "server-only";

import { z } from "zod";
import { defineTool } from "@kinetiks/tools";
import { getMetricsByApp } from "@/lib/oracle/metric-schema";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCachedMetric,
  isFresh,
  normalizeInput,
} from "@/lib/connections/metric-cache";

const META_KEYS = getMetricsByApp("meta_ads").map((m) => m.key) as [string, ...string[]];

if (META_KEYS.length === 0) {
  throw new Error(
    "meta_ads_query: METRIC_REGISTRY has no metrics for source_app='meta_ads'."
  );
}

const Input = z.object({
  metric: z.enum(META_KEYS),
  date_range: z.enum(["last_7_days", "last_28_days", "last_90_days"]),
  dimensions: z.array(z.literal("campaign")).max(1).optional(),
});

const Row = z.object({
  dimensions: z.record(z.string()),
  value: z.number(),
});

const Output = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    rows: z.array(Row),
    metric: z.enum(META_KEYS),
    metric_unit: z.enum(["count", "currency", "percentage", "ratio"]),
    date_range: z.object({ start: z.string(), end: z.string() }),
    ad_account_id: z.string(),
    cache_status: z.enum(["fresh", "stale"]),
    refreshed_at: z.string(),
  }),
  z.object({
    status: z.literal("not_connected"),
    connect_url: z.string(),
    message: z.string(),
  }),
  z.object({
    status: z.literal("no_data"),
    message: z.string(),
  }),
  z.object({
    status: z.literal("error"),
    error_class: z.enum(["query_failed", "unknown"]),
    message: z.string(),
  }),
]);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://kinetiks.ai";

export const metaAdsQueryTool = defineTool({
  name: "meta_ads_query",
  description:
    "Query Meta (Facebook + Instagram) ads performance. Returns spend, impressions, clicks, CTR, CPC, CPM, conversions, conversion value, or ROAS over the chosen window (last 7, 28, or 90 days). Optional dimension: 'campaign' (per-campaign breakdown, last 28 days only). Always returns a structured result — when Meta Ads is not connected the output is a typed status the assistant must surface to the user rather than computing. Read-only. Use this when the user asks about Facebook/Instagram ads, paid social, ROAS on Meta, or campaign performance.",
  inputSchema: Input,
  outputSchema: Output,
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "always" },
  execute: async (input, ctx) => {
    const admin = createAdminClient();

    const { data: connection } = await admin
      .from("kinetiks_connections")
      .select("id, account_id, status, metadata")
      .eq("account_id", ctx.accountId)
      .eq("provider", "meta_ads")
      .eq("status", "active")
      .maybeSingle();

    if (!connection) {
      return {
        status: "not_connected" as const,
        connect_url: `${APP_URL}/connections`,
        message:
          "Meta Ads is not connected to this account. Ask the user to connect Meta to enable ad-performance queries.",
      };
    }

    const adAccountId =
      typeof connection.metadata?.ad_account_id === "string"
        ? connection.metadata.ad_account_id
        : "";

    const cacheInput: Record<string, unknown> = {
      metric: input.metric,
      date_range: input.date_range,
      ad_account_id: adAccountId,
    };
    if (input.dimensions && input.dimensions.length > 0) {
      cacheInput.dimensions = input.dimensions;
    }

    const { hash } = normalizeInput(cacheInput);
    const cached = await getCachedMetric(admin, {
      account_id: ctx.accountId,
      source: "meta_ads",
      normalized_input_hash: hash,
    });

    if (!cached) {
      return {
        status: "no_data" as const,
        message:
          "Meta Ads is connected but no recent sync data is in the cache yet. Wait for the next sync (~1 hour) or trigger a manual one from Connections.",
      };
    }

    const response = cached.response as Record<string, unknown>;
    const cacheStatus: "fresh" | "stale" = isFresh(cached) ? "fresh" : "stale";
    return {
      status: "ok" as const,
      rows:
        (response.rows as Array<{ dimensions: Record<string, string>; value: number }>) ??
        [],
      metric: input.metric,
      metric_unit:
        (response.metric_unit as "count" | "currency" | "percentage" | "ratio") ?? "count",
      date_range: response.date_range as { start: string; end: string },
      ad_account_id: (response.ad_account_id as string) ?? adAccountId,
      cache_status: cacheStatus,
      refreshed_at: cached.refreshed_at,
    };
  },
});
