/**
 * gsc_query tool — Google Search Console traffic intelligence.
 *
 * Cache-backed reader. The webhook handler in
 * `apps/id/src/lib/integrations/nango/handlers/google-search-console.ts`
 * stamps cache rows on every Nango sync arrival; this tool reads them.
 *
 * Output is a discriminated union mirroring ga4_query so Marcus can
 * reason about the three states (ok / not_connected / error) without
 * special-casing per source.
 */

import "server-only";

import { z } from "zod";
import { defineTool } from "@kinetiks/tools";
import { serverEnv } from "@kinetiks/lib/env";
import { getMetricsByApp } from "@/lib/oracle/metric-schema";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCachedMetric,
  isFresh,
  normalizeInput,
} from "@/lib/connections/metric-cache";

const GSC_METRIC_KEYS = getMetricsByApp("gsc").map((m) => m.key) as [string, ...string[]];

if (GSC_METRIC_KEYS.length === 0) {
  throw new Error(
    "gsc_query: METRIC_REGISTRY has no metrics for source_app='gsc'. Update apps/id/src/lib/oracle/metric-schema.ts."
  );
}

const GscDimensionEnum = z.enum(["query", "page"]);

const Input = z.object({
  metric: z.enum(GSC_METRIC_KEYS),
  date_range: z.enum(["last_7_days", "last_28_days", "last_90_days"]),
  dimensions: z.array(GscDimensionEnum).max(1).optional(),
});

const Row = z.object({
  dimensions: z.record(z.string()),
  value: z.number(),
});

const Output = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    rows: z.array(Row),
    metric: z.enum(GSC_METRIC_KEYS),
    metric_unit: z.enum(["count", "percentage", "ratio"]),
    date_range: z.object({ start: z.string(), end: z.string() }),
    site_url: z.string(),
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

const APP_URL = serverEnv().NEXT_PUBLIC_APP_URL ?? "https://kinetiks.ai";

export const gscQueryTool = defineTool({
  name: "gsc_query",
  description:
    "Query Google Search Console for organic search performance. Returns impressions, clicks, click-through rate, or average ranking position over a chosen date range (last 7, 28, or 90 days). Optional single dimension: 'query' (top search terms) or 'page' (top landing pages). Always returns a structured result — when GSC is not connected the output is a typed status the assistant must surface to the user rather than computing. Read-only; never schedules an action. Use this when the user asks about search visibility, keywords, organic traffic from Google, or how the site is ranking.",
  inputSchema: Input,
  outputSchema: Output,
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "always" },
  // Phase 1.7.1 — connection-evidence attribution. Successful invocations
  // produce a kinetiks_id.connection_value_per_source observation that
  // closes with outcome=1 when the result is included in Marcus's brief.
  connection_provider: "gsc",
  cortex_layer: "market",
  execute: async (input, ctx) => {
    const admin = createAdminClient();

    // ── Resolve the GSC Nango-backed connection
    const { data: connection } = await admin
      .from("kinetiks_connections")
      .select("id, account_id, status, metadata")
      .eq("account_id", ctx.accountId)
      .eq("provider", "gsc")
      .eq("status", "active")
      .maybeSingle();

    if (!connection) {
      return {
        status: "not_connected" as const,
        connect_url: `${APP_URL}/connections`,
        message:
          "Google Search Console is not connected to this account. Ask the user to connect GSC to enable search-performance queries.",
      };
    }

    // ── Build the cache lookup key from the same shape the handler wrote
    const cacheInput: Record<string, unknown> = {
      metric: input.metric,
      date_range: input.date_range,
      site_url:
        typeof connection.metadata?.site_url === "string"
          ? connection.metadata.site_url
          : "",
    };
    if (input.dimensions && input.dimensions.length > 0) {
      cacheInput.dimensions = input.dimensions;
    }

    const { hash } = normalizeInput(cacheInput);
    const cached = await getCachedMetric(admin, {
      account_id: ctx.accountId,
      source: "gsc",
      normalized_input_hash: hash,
    });

    if (!cached) {
      return {
        status: "no_data" as const,
        message:
          "GSC is connected but no recent sync data is in the cache yet. Wait for the next Nango sync (typically within an hour) or trigger a manual sync from Connections.",
      };
    }

    const response = cached.response as Record<string, unknown>;
    const cacheStatus: "fresh" | "stale" = isFresh(cached) ? "fresh" : "stale";
    return {
      status: "ok" as const,
      rows: (response.rows as Array<{ dimensions: Record<string, string>; value: number }>) ?? [],
      metric: input.metric,
      metric_unit: (response.metric_unit as "count" | "percentage" | "ratio") ?? "count",
      date_range: response.date_range as { start: string; end: string },
      site_url: (response.site_url as string) ?? "",
      cache_status: cacheStatus,
      refreshed_at: cached.refreshed_at,
    };
  },
});
