/**
 * stripe_query tool — Stripe revenue + retention metrics.
 *
 * Cache-backed reader. The Stripe Nango webhook handlers stamp metric
 * cache rows for each of the 7 stripe_* metrics in METRIC_REGISTRY.
 * This tool reads them.
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

const STRIPE_METRIC_KEYS = getMetricsByApp("stripe").map((m) => m.key) as [string, ...string[]];

if (STRIPE_METRIC_KEYS.length === 0) {
  throw new Error(
    "stripe_query: METRIC_REGISTRY has no metrics for source_app='stripe'. Update apps/id/src/lib/oracle/metric-schema.ts."
  );
}

const Input = z.object({
  metric: z.enum(STRIPE_METRIC_KEYS),
});

const Output = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    metric: z.enum(STRIPE_METRIC_KEYS),
    value: z.number(),
    metric_unit: z.enum(["count", "currency", "percentage", "duration"]),
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

export const stripeQueryTool = defineTool({
  name: "stripe_query",
  description:
    "Query Stripe for revenue, customer, and retention metrics. Returns one number for the requested metric (MRR, ARR, new customers, churn rate, avg order value, refund rate, or LTV). Period is the last 28 days for most metrics; MRR/ARR are a current snapshot of active subscriptions. Always returns a structured result — when Stripe is not connected the output is a typed status the assistant must surface to the user rather than computing. Read-only; never schedules an action. Use this when the user asks about revenue, paying customers, recurring revenue, or churn.",
  inputSchema: Input,
  outputSchema: Output,
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "always" },
  execute: async (input, ctx) => {
    const admin = createAdminClient();

    const { data: connection } = await admin
      .from("kinetiks_connections")
      .select("id, account_id, status")
      .eq("account_id", ctx.accountId)
      .eq("provider", "stripe")
      .eq("status", "active")
      .maybeSingle();

    if (!connection) {
      return {
        status: "not_connected" as const,
        connect_url: `${APP_URL}/connections`,
        message:
          "Stripe is not connected to this account. Ask the user to connect Stripe to enable revenue queries.",
      };
    }

    const { hash } = normalizeInput({
      metric: input.metric,
      period: "last_28_days",
    });

    const cached = await getCachedMetric(admin, {
      account_id: ctx.accountId,
      source: "stripe",
      normalized_input_hash: hash,
    });

    if (!cached) {
      return {
        status: "no_data" as const,
        message:
          "Stripe is connected but no recent sync data is in the cache yet. Wait for the next Nango sync (typically within 30 minutes) or trigger a manual sync from Connections.",
      };
    }

    const response = cached.response as {
      rows?: Array<{ dimensions: Record<string, string>; value: number }>;
      metric_unit?: "count" | "currency" | "percentage" | "duration";
    };
    const value = response.rows?.[0]?.value ?? 0;
    const cacheStatus: "fresh" | "stale" = isFresh(cached) ? "fresh" : "stale";

    return {
      status: "ok" as const,
      metric: input.metric,
      value,
      metric_unit: response.metric_unit ?? "count",
      cache_status: cacheStatus,
      refreshed_at: cached.refreshed_at,
    };
  },
});
