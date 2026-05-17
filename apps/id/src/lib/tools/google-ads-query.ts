/**
 * google_ads_query tool — Google Ads performance.
 *
 * Cache-backed reader, mirrors the meta_ads_query shape.
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

const GADS_KEYS = getMetricsByApp("google_ads").map((m) => m.key) as [string, ...string[]];

if (GADS_KEYS.length === 0) {
  throw new Error(
    "google_ads_query: METRIC_REGISTRY has no metrics for source_app='google_ads'."
  );
}

const Input = z.object({
  metric: z.enum(GADS_KEYS),
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
    metric: z.enum(GADS_KEYS),
    metric_unit: z.enum(["count", "currency", "percentage", "ratio"]),
    date_range: z.object({ start: z.string(), end: z.string() }),
    customer_id: z.string(),
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

export const googleAdsQueryTool = defineTool({
  name: "google_ads_query",
  description:
    "Query Google Ads performance. Returns spend, impressions, clicks, CTR, CPC, conversions, conversion value, or ROAS over the chosen window (last 7, 28, or 90 days). Optional dimension: 'campaign' (per-campaign breakdown, last 28 days only). Always returns a structured result — when Google Ads is not connected the output is a typed status. Read-only. Use this when the user asks about Google Ads, search ads, paid search performance, or PPC ROAS.",
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
      .eq("provider", "google_ads")
      .eq("status", "active")
      .maybeSingle();

    if (!connection) {
      return {
        status: "not_connected" as const,
        connect_url: `${APP_URL}/connections`,
        message:
          "Google Ads is not connected to this account. Ask the user to connect Google Ads to enable paid-search queries.",
      };
    }

    const customerId =
      typeof connection.metadata?.customer_id === "string"
        ? connection.metadata.customer_id
        : "";

    const cacheInput: Record<string, unknown> = {
      metric: input.metric,
      date_range: input.date_range,
      customer_id: customerId,
    };
    if (input.dimensions && input.dimensions.length > 0) {
      cacheInput.dimensions = input.dimensions;
    }

    const { hash } = normalizeInput(cacheInput);
    const cached = await getCachedMetric(admin, {
      account_id: ctx.accountId,
      source: "google_ads",
      normalized_input_hash: hash,
    });

    if (!cached) {
      return {
        status: "no_data" as const,
        message:
          "Google Ads is connected but no recent sync data is in the cache yet. Wait for the next sync (~1 hour) or trigger a manual one from Connections.",
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
      customer_id: (response.customer_id as string) ?? customerId,
      cache_status: cacheStatus,
      refreshed_at: cached.refreshed_at,
    };
  },
});
