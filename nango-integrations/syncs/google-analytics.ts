/**
 * Nango sync — Google Analytics 4 — ga4-daily-metrics.
 *
 * Runs on Nango's TypeScript runtime. Deployed via `npx nango deploy`.
 *
 * Pulls three GA4 metrics (sessions, total users, bounce rate) for the
 * last 90 days with `date` as the primary dimension. Walks five
 * secondary dimension slices:
 *   - overall (no secondary dimension)
 *   - country
 *   - device
 *   - source
 *   - medium
 *   - page_path (last 28 days only — too large for 90d)
 *
 * Output: one Ga4MetricPoint record per (metric × date × dim × dim_value).
 *
 * Property id resolution: the connection metadata is set by our Connect
 * UI wrapper after the user picks a property. If `property_id` is
 * absent at sync time, the sync no-ops cleanly (Nango fires a webhook
 * with success=true and 0 records — our handler treats that as a
 * "needs-property-picker" state and surfaces a banner).
 *
 * Auth: Nango handles OAuth + token refresh. We just call
 * `nango.proxy()` which signs the request with the connection's access
 * token.
 *
 * SLICE 5 NOTE: This script is committed but not yet deployed to Nango.
 * Deploy step requires `NANGO_SECRET_KEY` in the shell. See
 * `nango-integrations/README.md`.
 */

import type { NangoSync } from "@nangohq/sync";

// Three metrics + five dimension slices we emit.
const METRICS: Array<{
  key: "ga4_sessions" | "ga4_users" | "ga4_bounce_rate";
  ga4Name: string;
  unit: "count" | "percentage";
}> = [
  { key: "ga4_sessions", ga4Name: "sessions", unit: "count" },
  { key: "ga4_users", ga4Name: "totalUsers", unit: "count" },
  { key: "ga4_bounce_rate", ga4Name: "bounceRate", unit: "percentage" },
];

const DIMENSION_SLICES: Array<{
  dimension: "overall" | "country" | "device" | "source" | "medium" | "page_path";
  ga4Names: string[];
  dateRange: { startDate: string; endDate: string };
}> = [
  { dimension: "overall", ga4Names: [], dateRange: { startDate: "90daysAgo", endDate: "today" } },
  { dimension: "country", ga4Names: ["country"], dateRange: { startDate: "90daysAgo", endDate: "today" } },
  { dimension: "device", ga4Names: ["deviceCategory"], dateRange: { startDate: "90daysAgo", endDate: "today" } },
  { dimension: "source", ga4Names: ["sessionSource"], dateRange: { startDate: "90daysAgo", endDate: "today" } },
  { dimension: "medium", ga4Names: ["sessionMedium"], dateRange: { startDate: "90daysAgo", endDate: "today" } },
  // page_path is high-cardinality; constrain to 28d to keep payloads sane.
  { dimension: "page_path", ga4Names: ["pagePath"], dateRange: { startDate: "28daysAgo", endDate: "today" } },
];

interface Ga4MetricPoint {
  id: string;
  metric: string;
  property_id: string;
  date: string;
  dimension: string;
  dim_value: string;
  value: number;
  metric_unit: string;
}

interface Ga4RunReportResponse {
  rows?: Array<{
    dimensionValues: Array<{ value: string }>;
    metricValues: Array<{ value: string }>;
  }>;
}

export default async function fetchGa4DailyMetrics(nango: NangoSync): Promise<void> {
  const metadata = (await nango.getMetadata()) as { property_id?: string };
  const propertyId = metadata?.property_id;

  if (!propertyId) {
    await nango.log(
      "ga4-daily-metrics: connection metadata missing property_id; the user must pick a GA4 property. Sync no-ops."
    );
    return;
  }

  for (const metric of METRICS) {
    for (const slice of DIMENSION_SLICES) {
      try {
        await fetchOneSlice(nango, propertyId, metric, slice);
      } catch (err) {
        await nango.log(
          `ga4-daily-metrics: slice failed metric=${metric.key} dim=${slice.dimension}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        // Continue with the next slice — partial coverage beats no data.
      }
    }
  }
}

async function fetchOneSlice(
  nango: NangoSync,
  propertyId: string,
  metric: (typeof METRICS)[number],
  slice: (typeof DIMENSION_SLICES)[number]
): Promise<void> {
  // Always include date as the primary dimension so the response carries
  // the daily series we need for trend/anomaly detection.
  const dimensions = [{ name: "date" }, ...slice.ga4Names.map((n) => ({ name: n }))];

  const response = await nango.proxy({
    method: "POST",
    endpoint: `/v1beta/properties/${propertyId}:runReport`,
    data: {
      dateRanges: [slice.dateRange],
      metrics: [{ name: metric.ga4Name }],
      dimensions,
      // GA4 returns at most 100K rows per response. For page_path × 28d
      // we may approach the limit on big sites; set `limit` explicitly.
      limit: 100000,
    },
    retries: 3,
  });

  const body = response.data as Ga4RunReportResponse;
  const rows = body?.rows ?? [];

  const points: Ga4MetricPoint[] = [];
  for (const row of rows) {
    const dimValues = row.dimensionValues ?? [];
    const date = dimValues[0]?.value ?? "";
    const dimValue = slice.dimension === "overall" ? "" : (dimValues[1]?.value ?? "");
    const rawValue = Number(row.metricValues?.[0]?.value ?? "0");
    const value = metric.unit === "percentage" && Number.isFinite(rawValue) ? rawValue * 100 : rawValue;

    if (!date || !Number.isFinite(value)) continue;

    points.push({
      id: `${metric.key}::${slice.dimension}::${dimValue}::${date}`,
      metric: metric.key,
      property_id: propertyId,
      date,
      dimension: slice.dimension,
      dim_value: dimValue,
      value,
      metric_unit: metric.unit,
    });
  }

  if (points.length > 0) {
    await nango.batchSave<Ga4MetricPoint>(points, "Ga4MetricPoint");
  }
}
