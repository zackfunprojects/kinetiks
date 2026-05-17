import "server-only";

import { z } from "zod";
import { defineTool } from "@kinetiks/tools";
import { getMetricsByApp } from "@/lib/oracle/metric-schema";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getConnectionByProvider,
} from "@/lib/connections/manager";
import {
  cacheStatus,
  getCachedMetric,
  isFresh,
  normalizeInput,
  withRefreshLock,
  writeCachedMetric,
  type CacheStatus,
} from "@/lib/connections/metric-cache";
import { withFreshToken } from "@/lib/connections/refresh-token";
import {
  createGa4Client,
  getStaleAfterSeconds,
  runGa4Query,
  type Ga4DimensionKey,
  type Ga4MetricKey,
  type Ga4Query,
  type Ga4QueryResponse,
} from "@/lib/connections/extractors/ga4";

// ─── Input schema derived from METRIC_REGISTRY ─────────────
//
// The single source of truth for what metrics Marcus can query is the
// Oracle metric registry. Building the Zod enum at module load means
// adding a new GA4 metric only requires extending METRIC_REGISTRY; the
// tool surface stays in sync automatically.
const GA4_METRIC_KEYS = getMetricsByApp("ga4").map((m) => m.key) as Ga4MetricKey[];

if (GA4_METRIC_KEYS.length === 0) {
  // Boot-time guarantee: METRIC_REGISTRY must contain GA4 metrics, otherwise
  // this tool has no valid input and registry validation would catch it
  // later anyway. Fail loud here.
  throw new Error(
    "ga4_query: METRIC_REGISTRY has no metrics for source_app='ga4'. Update apps/id/src/lib/oracle/metric-schema.ts."
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
    metric: z.enum(GA4_METRIC_KEYS as [Ga4MetricKey, ...Ga4MetricKey[]]),
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
      path: ["date_range"],
    }
  );

// ─── Output: discriminated union ──────────────────────────
//
// Marcus's brief carries the tool inventory regardless of whether the
// account has GA4 connected, per architecture decision I. The
// discriminated output lets Marcus distinguish "real numbers cited" from
// "user needs to connect GA4" without surfacing the tool as missing.
const Ga4Row = z.object({
  dimensions: z.record(z.string()),
  value: z.number(),
});

const Ga4QueryOutput = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    rows: z.array(Ga4Row),
    metric: z.enum(GA4_METRIC_KEYS as [Ga4MetricKey, ...Ga4MetricKey[]]),
    metric_unit: z.enum(["count", "percentage"]),
    date_range: z.object({ start: z.string(), end: z.string() }),
    property_id: z.string(),
    cache_status: z.enum(["fresh", "stale_revalidating", "fresh_from_extractor"]),
    refreshed_at: z.string(),
  }),
  z.object({
    status: z.literal("not_connected"),
    connect_url: z.string(),
    message: z.string(),
  }),
  z.object({
    status: z.literal("no_property"),
    property_picker_url: z.string(),
    message: z.string(),
  }),
  z.object({
    status: z.literal("error"),
    error_class: z.enum([
      "reauthorize_required",
      "permission_denied",
      "transient_provider_error",
      "unknown",
    ]),
    message: z.string(),
  }),
]);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://kinetiks.ai";

export const ga4QueryTool = defineTool({
  name: "ga4_query",
  description:
    "Query Google Analytics 4 for website traffic data. Returns sessions, unique users, or bounce rate over a chosen date range (last 7, 28, or 90 days, or a custom range). Optional dimensions: country, device, source, medium, page_path (up to 3). Always returns a structured result — when the account has not connected GA4 or has not yet picked a property, the output is a typed status the assistant must surface to the user rather than attempting to compute. Read-only; never schedules an action. Use this any time the user asks about website traffic, audience, or engagement metrics.",
  inputSchema: Ga4QueryInput,
  outputSchema: Ga4QueryOutput,
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "always" },
  execute: async (input, ctx) => {
    const admin = createAdminClient();

    // ─── Resolve the GA4 connection ─────────────────────────
    const connection = await getConnectionByProvider(admin, ctx.accountId, "ga4");
    if (!connection || connection.status !== "active") {
      return {
        status: "not_connected" as const,
        connect_url: `${APP_URL}/connections`,
        message:
          "Google Analytics 4 is not connected to this account. Ask the user to connect GA4 to enable traffic queries.",
      };
    }

    const propertyId =
      typeof connection.metadata?.property_id === "string"
        ? connection.metadata.property_id
        : null;

    if (!propertyId) {
      return {
        status: "no_property" as const,
        property_picker_url: `${APP_URL}/connections?ga4_pick=1`,
        message:
          "GA4 is connected but no property is selected. Ask the user to pick which Analytics property to query.",
      };
    }

    // ─── Cache lookup ───────────────────────────────────────
    const ga4Query: Ga4Query = {
      metric: input.metric,
      date_range: input.date_range,
      start_date: input.start_date,
      end_date: input.end_date,
      dimensions: input.dimensions as Ga4DimensionKey[] | undefined,
      compare_to: input.compare_to ?? null,
    };
    const { hash } = normalizeInput({ ...ga4Query, property_id: propertyId });

    let cached = await getCachedMetric(admin, {
      account_id: ctx.accountId,
      source: "ga4",
      normalized_input_hash: hash,
    });

    if (cached && isFresh(cached)) {
      return buildOkOutput(cached.response as unknown as Ga4QueryResponse, "fresh", cached.refreshed_at);
    }

    // ─── Miss or stale — refresh inline ─────────────────────
    //
    // True SWR (return stale + enqueue background refresh) requires
    // out-of-band background work that Next.js Server Actions cannot
    // reliably do. The cron's 15-minute cadence keeps fresh data flowing
    // for active queries; the inline refresh on a cache miss handles
    // the cold-start and after-cron-edge cases.
    //
    // We do gate concurrent refreshes via the advisory lock so two
    // simultaneous requests don't double-fetch GA4.
    let lockResult: Awaited<ReturnType<typeof withRefreshLock<Ga4QueryResponse>>>;
    try {
      lockResult = await withRefreshLock<Ga4QueryResponse>(
        admin,
        { account_id: ctx.accountId, source: "ga4", normalized_input_hash: hash },
        () =>
          withFreshToken(admin, connection, async (creds) => {
            const client = await createGa4Client(creds);
            return runGa4Query(client, propertyId, ga4Query);
          })
      );
    } catch (err) {
      // The advisory lock was acquired but fn threw — withRefreshLock
      // released the lock and rethrew. Classify and surface gracefully so
      // Marcus can react with the right tone.
      return classifyError(err);
    }

    if (!lockResult.acquired) {
      // Another worker is refreshing. If we have a stale row, return it
      // with the stale_revalidating marker so Marcus can hedge.
      if (cached) {
        return buildOkOutput(
          cached.response as unknown as Ga4QueryResponse,
          "stale_revalidating",
          cached.refreshed_at
        );
      }
      // No stale data and another worker has the lock — surface a soft error.
      return {
        status: "error" as const,
        error_class: "transient_provider_error" as const,
        message:
          "A GA4 refresh is already in flight for this query. Try again shortly.",
      };
    }

    const response = lockResult.result;

    // Persist the new cache row (best-effort; if the write fails we still
    // return the live response — Marcus answer is more important than the cache).
    try {
      await writeCachedMetric(admin, {
        account_id: ctx.accountId,
        source: "ga4",
        input: { ...ga4Query, property_id: propertyId } as Record<string, unknown>,
        response: response as unknown as Record<string, unknown>,
        stale_after_seconds: getStaleAfterSeconds(ga4Query),
      });
    } catch (err) {
      console.error(
        `ga4_query: cache write failed for account ${ctx.accountId}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    return buildOkOutput(response, "fresh_from_extractor", new Date().toISOString());
  },
});

function buildOkOutput(
  response: Ga4QueryResponse,
  status: CacheStatus,
  refreshed_at: string
) {
  return {
    status: "ok" as const,
    rows: response.rows.map((r) => ({
      dimensions: { ...r.dimensions } as Record<string, string>,
      value: r.value,
    })),
    metric: response.metric,
    metric_unit: response.metric_unit,
    date_range: response.date_range,
    property_id: response.property_id,
    cache_status: status,
    refreshed_at,
  };
}

function classifyError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (/TokenRejected|reauthorize/i.test(message)) {
    return {
      status: "error" as const,
      error_class: "reauthorize_required" as const,
      message:
        "GA4 rejected the stored OAuth token; the user needs to reconnect GA4.",
    };
  }
  if (/PERMISSION_DENIED|forbidden|403/i.test(message)) {
    return {
      status: "error" as const,
      error_class: "permission_denied" as const,
      message:
        "GA4 declined the request. Verify the connected account has property access.",
    };
  }
  if (/quota|rate|timeout|5\d\d/i.test(message)) {
    return {
      status: "error" as const,
      error_class: "transient_provider_error" as const,
      message: "GA4 is rate-limited or unreachable. The cache will retry.",
    };
  }
  return {
    status: "error" as const,
    error_class: "unknown" as const,
    message,
  };
}
