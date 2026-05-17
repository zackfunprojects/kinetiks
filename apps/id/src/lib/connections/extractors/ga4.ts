/**
 * GA4 extractor + runGa4Query primitive.
 *
 * Two entry points:
 *
 *  1. ga4Extractor(context) — registered with registerExtractor('ga4', ...).
 *     Invoked by runExtraction() on connection-active sync. Seeds the
 *     metric cache for the account's default queries so the tool can serve
 *     fresh data immediately after first-connect. Returns no Proposals;
 *     proposal emission from GA4 trends lands in D2.
 *
 *  2. runGa4Query(client, property_id, query) — the shared primitive used
 *     by both the metric-cache cron and the ga4_query tool's miss-path.
 *     Pure: takes a Ga4Client + property + structured query, returns
 *     normalized rows. No DB writes here; the caller decides what to do
 *     with the response (write cache, return to tool, etc.).
 *
 * The Ga4Client interface is the test seam: production code uses
 * createGa4Client() which wraps @google-analytics/data's
 * BetaAnalyticsDataClient + google-auth-library's OAuth2Client.
 *
 * Token handling:
 *   - Production calls go through withFreshToken(), so a 401 from GA4
 *     triggers exactly one forced refresh + retry. The Ga4Client adapter
 *     translates GA4-API errors with status==401 into TokenRejectedError
 *     so withFreshToken can react.
 */

import "server-only";

import type { ExtractorFn } from "../extract";
import { registerExtractor } from "../extract";
import { TokenRejectedError } from "../refresh-token";
import type { StoredOAuthCredentials } from "../types";

// ─── Public types ───────────────────────────────────────────

/** GA4 metric keys we expose. Source of truth: METRIC_REGISTRY (oracle/metric-schema.ts). */
export type Ga4MetricKey = "ga4_sessions" | "ga4_users" | "ga4_bounce_rate";

/** Dimensions ga4_query can request. Constrained to keep the cache key finite. */
export type Ga4DimensionKey =
  | "country"
  | "device"
  | "source"
  | "medium"
  | "page_path";

export type Ga4DateRangeKey =
  | "last_7_days"
  | "last_28_days"
  | "last_90_days"
  | "custom";

export interface Ga4Query {
  metric: Ga4MetricKey;
  date_range: Ga4DateRangeKey;
  /** Required when date_range === "custom"; ignored otherwise. ISO date YYYY-MM-DD. */
  start_date?: string;
  end_date?: string;
  dimensions?: Ga4DimensionKey[];
  compare_to?: "previous_period" | null;
}

export interface Ga4Row {
  /** Dimension values, parallel to the dimensions array on the query. */
  dimensions: Record<Ga4DimensionKey, string> | Record<string, never>;
  /** Numeric value of the requested metric for this row. */
  value: number;
  /** Optional comparison value (set when compare_to === 'previous_period'). */
  compare_value?: number;
}

export interface Ga4QueryResponse {
  rows: Ga4Row[];
  metric: Ga4MetricKey;
  metric_unit: "count" | "percentage";
  date_range: { start: string; end: string };
  compare_range?: { start: string; end: string };
  property_id: string;
}

// ─── Test seam: Ga4Client ──────────────────────────────────

export interface Ga4Client {
  runReport(args: Ga4RunReportArgs): Promise<Ga4RunReportResponse>;
}

export interface Ga4RunReportArgs {
  property: string;                                         // 'properties/<id>'
  dateRanges: Array<{ startDate: string; endDate: string }>;
  metrics: Array<{ name: string }>;
  dimensions: Array<{ name: string }>;
}

export interface Ga4RunReportResponse {
  rows: Array<{
    dimensionValues: Array<{ value: string }>;
    metricValues: Array<{ value: string }>;
  }>;
}

// ─── TTL dispatch ──────────────────────────────────────────

/**
 * Per-metric stale-after window. Top-of-funnel acquisition refreshes
 * every 15 minutes; engagement metrics every hour. Historical lookbacks
 * (date_range != last_7_days) get a 24h TTL because they drift slowly.
 *
 * D3 adds stripe + gsc metrics by extending this table.
 */
const TTL_SECONDS: Record<Ga4MetricKey, number> = {
  ga4_sessions: 900,
  ga4_users: 900,
  ga4_bounce_rate: 3600,
};

export function getStaleAfterSeconds(query: Ga4Query): number {
  const baseline = TTL_SECONDS[query.metric];
  // Historical windows refresh daily — they don't shift minute-to-minute.
  if (query.date_range === "last_90_days") return 86_400;
  return baseline;
}

// ─── Query translation ─────────────────────────────────────

const METRIC_NAME: Record<Ga4MetricKey, string> = {
  ga4_sessions: "sessions",
  ga4_users: "totalUsers",
  ga4_bounce_rate: "bounceRate",
};

const METRIC_UNIT: Record<Ga4MetricKey, "count" | "percentage"> = {
  ga4_sessions: "count",
  ga4_users: "count",
  ga4_bounce_rate: "percentage",
};

const DIMENSION_NAME: Record<Ga4DimensionKey, string> = {
  country: "country",
  device: "deviceCategory",
  source: "sessionSource",
  medium: "sessionMedium",
  page_path: "pagePath",
};

/**
 * Resolve the GA4-native start/end dates for the requested range.
 * GA4 accepts NdaysAgo / today / yyyy-MM-dd.
 */
export function resolveDateRange(query: Ga4Query): { start: string; end: string } {
  switch (query.date_range) {
    case "last_7_days":
      return { start: "7daysAgo", end: "today" };
    case "last_28_days":
      return { start: "28daysAgo", end: "today" };
    case "last_90_days":
      return { start: "90daysAgo", end: "today" };
    case "custom": {
      if (!query.start_date || !query.end_date) {
        throw new Error(
          "ga4_query: custom date_range requires start_date and end_date"
        );
      }
      return { start: query.start_date, end: query.end_date };
    }
  }
}

// ─── runGa4Query primitive ────────────────────────────────

/**
 * Execute a single GA4 query and return normalized rows.
 *
 * Caller is responsible for:
 *   - Providing a Ga4Client (real or mocked)
 *   - Cache freshness decisions (this function always hits GA4)
 *   - Wrapping with withFreshToken() if it wants 401 retry semantics
 *
 * Errors:
 *   - TokenRejectedError on 401 from GA4 (translated by the client adapter)
 *   - Generic Error for other API failures
 */
export async function runGa4Query(
  client: Ga4Client,
  propertyId: string,
  query: Ga4Query
): Promise<Ga4QueryResponse> {
  if (!propertyId) {
    throw new Error("ga4_query: missing property_id (set kinetiks_connections.metadata.property_id)");
  }

  const { start, end } = resolveDateRange(query);
  const dimensions = (query.dimensions ?? []).map((d) => ({
    name: DIMENSION_NAME[d],
  }));

  const response = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: start, endDate: end }],
    metrics: [{ name: METRIC_NAME[query.metric] }],
    dimensions,
  });

  const dimKeys = query.dimensions ?? [];
  const rows: Ga4Row[] = (response.rows ?? []).map((r) => {
    const dimMap: Record<string, string> = {};
    r.dimensionValues.forEach((dv, idx) => {
      const key = dimKeys[idx];
      if (key) dimMap[key] = dv.value;
    });
    const raw = r.metricValues[0]?.value ?? "0";
    return {
      dimensions: dimMap as Record<Ga4DimensionKey, string> | Record<string, never>,
      value: parseGa4Number(raw, query.metric),
    };
  });

  return {
    rows,
    metric: query.metric,
    metric_unit: METRIC_UNIT[query.metric],
    date_range: { start, end },
    property_id: propertyId,
  };
}

function parseGa4Number(raw: string, metric: Ga4MetricKey): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  // Bounce rate is returned as a 0..1 fraction; surface as a 0..100 percentage.
  if (METRIC_UNIT[metric] === "percentage") return n * 100;
  return n;
}

// ─── Real Ga4Client adapter ───────────────────────────────

/**
 * Build a Ga4Client wired to @google-analytics/data + google-auth-library
 * using the connection's OAuth credentials.
 *
 * Lazily imports @google-analytics/data so that test files which inject a
 * mock Ga4Client never pull in the heavy SDK at module load.
 */
export async function createGa4Client(
  creds: StoredOAuthCredentials
): Promise<Ga4Client> {
  // Lazy import keeps unit tests fast and lets us defer the dependency to
  // production / smoke-test code paths only.
  const [{ BetaAnalyticsDataClient }, { OAuth2Client }] = await Promise.all([
    import("@google-analytics/data"),
    import("google-auth-library"),
  ]);

  const auth = new OAuth2Client();
  auth.setCredentials({
    access_token: creds.access_token,
    refresh_token: creds.refresh_token ?? undefined,
    expiry_date: creds.expires_at ? creds.expires_at * 1000 : undefined,
  });

  const native = new BetaAnalyticsDataClient({ authClient: auth as never });

  return {
    async runReport(args) {
      try {
        const [response] = await native.runReport(args as never);
        return {
          rows: (response.rows ?? []).map((r) => ({
            dimensionValues: (r.dimensionValues ?? []).map((dv) => ({
              value: dv.value ?? "",
            })),
            metricValues: (r.metricValues ?? []).map((mv) => ({
              value: mv.value ?? "0",
            })),
          })),
        };
      } catch (err) {
        if (isUnauthorizedError(err)) {
          throw new TokenRejectedError("ga4", {
            httpStatus: 401,
            cause: err,
          });
        }
        throw err;
      }
    },
  };
}

function isUnauthorizedError(err: unknown): boolean {
  if (err instanceof Error) {
    // gRPC / google-cloud surfaces 16 (UNAUTHENTICATED) on the error object.
    const anyErr = err as Error & { code?: number; status?: number };
    if (anyErr.code === 16) return true;
    if (anyErr.status === 401) return true;
    if (/UNAUTHENTICATED|invalid_grant|401/.test(err.message)) return true;
  }
  return false;
}

// ─── ExtractorFn registration ─────────────────────────────

/**
 * The extractor invoked by runExtraction() during sync. D1 returns an
 * empty Proposal list — GA4 cache fill is handled separately via the
 * metric-cache cron + on-demand tool calls. D2 lands proposal emission
 * (Oracle insights derived from GA4 trends).
 */
export const ga4Extractor: ExtractorFn = async () => {
  return [];
};

// Side-effect: register at module load. The barrel
// (apps/id/src/lib/connections/extractors/index.ts) imports this file so
// instrumentation.ts can pick up the registration via one entry point.
registerExtractor("ga4", ga4Extractor);
