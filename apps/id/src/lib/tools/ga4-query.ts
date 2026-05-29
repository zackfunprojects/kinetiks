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

/**
 * Marcus tool — read GA4 traffic metrics.
 *
 * Phase 7 — cache-only. The legacy live-fallback (withFreshToken +
 * runGa4Query against the GA4 Data API) is removed; GA4 OAuth tokens
 * are now held entirely by Nango, and the GA4 sync handler at
 * `apps/id/src/lib/integrations/nango/handlers/google-analytics.ts`
 * populates `kinetiks_metric_cache` via the webhook flow.
 *
 * When the cache is cold (first-connect, before the initial sync
 * webhook has arrived) this tool returns a structured `syncing`
 * status that Marcus surfaces in plain language — "GA4 is still
 * loading; check back in a moment" — rather than an error. The
 * initial sync is triggered automatically by the auth webhook
 * (handlers/auth.ts), so the cold window is typically under 60s.
 */

const GA4_METRIC_KEYS = getMetricsByApp("ga4").map((m) => m.key) as [string, ...string[]];

if (GA4_METRIC_KEYS.length === 0) {
  throw new Error(
    "ga4_query: METRIC_REGISTRY has no metrics for source_app='ga4'. Update apps/id/src/lib/oracle/metric-schema.ts.",
  );
}

const Ga4DimensionEnum = z.enum([
  "country",
  "device",
  "source",
  "medium",
  "page_path",
]);

const Ga4QueryInput = z
  .object({
    metric: z.enum(GA4_METRIC_KEYS),
    date_range: z.enum([
      "last_7_days",
      "last_28_days",
      "last_90_days",
      "custom",
    ]),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD")
      .optional(),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "end_date must be YYYY-MM-DD")
      .optional(),
    dimensions: z.array(Ga4DimensionEnum).max(3).optional(),
    compare_to: z.enum(["previous_period"]).nullable().optional(),
  })
  .refine(
    (input) =>
      input.date_range !== "custom" ||
      (input.start_date !== undefined && input.end_date !== undefined),
    {
      message: "custom date_range requires start_date and end_date (YYYY-MM-DD)",
    },
  );

const Ga4QueryOutput = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    rows: z.array(
      z.object({
        dimensions: z.record(z.string(), z.string()),
        value: z.number(),
      }),
    ),
    metric: z.enum(GA4_METRIC_KEYS),
    metric_unit: z.enum(["count", "percentage"]),
    date_range: z.object({ start: z.string(), end: z.string() }),
    property_id: z.string(),
    cache_status: z.enum(["fresh", "stale"]),
    refreshed_at: z.string(),
  }),
  z.object({
    status: z.literal("not_connected"),
    message: z.string(),
  }),
  z.object({
    status: z.literal("syncing"),
    message: z.string(),
  }),
  z.object({
    status: z.literal("no_property"),
    message: z.string(),
  }),
]);

interface CachedGa4Response {
  rows: Array<{ dimensions: Record<string, string>; value: number }>;
  metric: string;
  metric_unit: "count" | "percentage";
  date_range: { start: string; end: string };
  property_id: string;
}

export const ga4QueryTool = defineTool({
  name: "ga4_query",
  description:
    "Read Google Analytics 4 traffic metrics from the synced cache. Returns sessions, unique users, bounce rate, or any other GA4 metric over the last 7/28/90 days (or a custom range). Optional dimensions: country, device, source, medium, page_path (up to 3). Always returns a structured result: `ok` with data, `not_connected` when GA4 is not connected, `syncing` when the initial sync is still in progress, or `no_property` when GA4 is connected but no property is selected. Read-only; never schedules an action. Use this any time the user asks about website traffic, audience, or engagement metrics.",
  inputSchema: Ga4QueryInput,
  outputSchema: Ga4QueryOutput,
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "connection_required", provider: "ga4" },
  connection_provider: "ga4",
  cortex_layer: "market",
  execute: async (input, ctx) => {
    const admin = createAdminClient();

    const { data: connection } = await admin
      .from("kinetiks_connections")
      .select("status, metadata")
      .eq("account_id", ctx.accountId)
      .eq("provider", "ga4")
      .eq("status", "active")
      .maybeSingle();
    if (!connection) {
      return {
        status: "not_connected" as const,
        message:
          "Google Analytics 4 is not connected. Connect it in the dashboard to query traffic.",
      };
    }

    const metadata = (connection.metadata as Record<string, unknown> | null) ?? {};
    const propertyId =
      typeof metadata.property_id === "string" ? metadata.property_id : null;
    if (!propertyId) {
      return {
        status: "no_property" as const,
        message:
          "GA4 is connected but no property is selected yet. The first sync will pick one automatically.",
      };
    }

    const ga4Query = {
      metric: input.metric,
      date_range: input.date_range,
      start_date: input.start_date,
      end_date: input.end_date,
      dimensions: input.dimensions,
      compare_to: input.compare_to ?? null,
      property_id: propertyId,
    };
    const { hash } = normalizeInput(ga4Query);

    const cached = await getCachedMetric(admin, {
      account_id: ctx.accountId,
      source: "ga4",
      normalized_input_hash: hash,
    });

    if (!cached) {
      return {
        status: "syncing" as const,
        message:
          "Your GA4 data is still loading. Initial sync runs automatically — usually under a minute after connecting.",
      };
    }

    const response = cached.response as unknown as CachedGa4Response;
    return {
      status: "ok" as const,
      rows: response.rows.map((r) => ({
        dimensions: { ...r.dimensions },
        value: r.value,
      })),
      metric: response.metric,
      metric_unit: response.metric_unit,
      date_range: response.date_range,
      property_id: response.property_id,
      cache_status: isFresh(cached) ? ("fresh" as const) : ("stale" as const),
      refreshed_at: cached.refreshed_at,
    };
  },
});
