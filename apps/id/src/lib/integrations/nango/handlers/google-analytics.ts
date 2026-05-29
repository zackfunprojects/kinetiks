/**
 * Nango sync handler — Google Analytics 4 (ga4-daily-metrics).
 *
 * Slice 5 implementation. Fetches Ga4MetricPoint records from Nango's
 * records API (paginated), aggregates them into the per-query shape the
 * D1 ga4_query tool expects, and writes one cache row per
 * (metric, date_range, dimensions) combination.
 *
 * Cache row shape (matches what runGa4Query produced in D1):
 *   response = {
 *     rows: Ga4Row[],
 *     metric: Ga4MetricKey,
 *     metric_unit: 'count' | 'percentage',
 *     date_range: { start, end },
 *     property_id: string
 *   }
 *
 * We populate three slices of cache rows from the same record set:
 *   - last_7_days × no dimensions       (the D1 default)
 *   - last_28_days × no dimensions
 *   - last_90_days × ['date']           (used by the Oracle history reader)
 * Plus one cache row per metric × dimension slice for last_28_days, so
 * cross-dimension drill detectors have data.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRecords, NangoMisconfiguredError } from "../client";
import { registerNangoHandler } from ".";
import type { NangoHandlerFn, NangoHandlerResult } from "../types";
import { writeCachedMetric } from "@/lib/connections/metric-cache";

type MetricKey = "ga4_sessions" | "ga4_users" | "ga4_bounce_rate";
type DimensionKey = "overall" | "country" | "device" | "source" | "medium" | "page_path";
type DateRangeKey = "last_7_days" | "last_28_days" | "last_90_days";

// Inlined from the Phase-6-deleted `extractors/ga4.ts`. Per-metric
// TTL chosen to balance freshness vs the GA4 Data API rate limit;
// historical 90-day windows refresh daily because the data doesn't
// shift minute-to-minute.
const GA4_TTL_SECONDS: Record<MetricKey, number> = {
  ga4_sessions: 15 * 60,
  ga4_users: 60 * 60,
  ga4_bounce_rate: 60 * 60,
};
function getStaleAfterSeconds(query: { metric: MetricKey; date_range: DateRangeKey }): number {
  if (query.date_range === "last_90_days") return 86_400;
  return GA4_TTL_SECONDS[query.metric];
}

interface Ga4MetricPoint {
  id: string;
  metric: MetricKey;
  property_id: string;
  date: string;
  dimension: DimensionKey;
  dim_value: string;
  value: number;
  metric_unit: "count" | "percentage";
}

// ─── Aggregation helpers ────────────────────────────────────

function isWithin(date: string, daysAgo: number, today: Date): boolean {
  const d = new Date(date);
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - daysAgo);
  return d >= cutoff && d <= today;
}

function rangeWindow(range: DateRangeKey): number {
  switch (range) {
    case "last_7_days":
      return 7;
    case "last_28_days":
      return 28;
    case "last_90_days":
      return 90;
  }
}

function rangeLabel(range: DateRangeKey, today: Date): { start: string; end: string } {
  const end = today.toISOString().slice(0, 10);
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - rangeWindow(range));
  return { start: startDate.toISOString().slice(0, 10), end };
}

interface AggKey {
  metric: MetricKey;
  range: DateRangeKey;
  dimensions: DimensionKey[];  // [] for overall, ['date'] for time-series, [dim] for slice
}

interface AggBucket {
  rows: Map<string, { sum: number; count: number }>;
  unit: "count" | "percentage";
  propertyId: string;
}

function rowKey(dim: DimensionKey | "date", dimValue: string): string {
  return `${dim}::${dimValue}`;
}

/** Aggregate records into per-query buckets. */
function aggregate(
  records: Ga4MetricPoint[],
  today: Date
): Map<string, { key: AggKey; bucket: AggBucket }> {
  const buckets = new Map<string, { key: AggKey; bucket: AggBucket }>();

  const targetRanges: DateRangeKey[] = ["last_7_days", "last_28_days", "last_90_days"];

  for (const rec of records) {
    const isAvgMetric = rec.metric_unit === "percentage";

    for (const range of targetRanges) {
      // Skip page_path on >28d (sync only covers 28d for page_path).
      if (rec.dimension === "page_path" && range === "last_90_days") continue;
      if (!isWithin(rec.date, rangeWindow(range), today)) continue;

      // 1) Overall (no secondary dimension): only emit when this slice IS the overall
      if (rec.dimension === "overall") {
        upsertBucket(buckets, { metric: rec.metric, range, dimensions: [] }, rec, rec.metric_unit, "overall", "");

        // Also emit a per-date time-series view (for trend/anomaly):
        upsertBucket(
          buckets,
          { metric: rec.metric, range, dimensions: ["overall" as DimensionKey] /* sentinel for ['date'] */ },
          rec,
          rec.metric_unit,
          "date",
          rec.date
        );
      } else {
        // 2) Per-dimension slice
        upsertBucket(
          buckets,
          { metric: rec.metric, range, dimensions: [rec.dimension] },
          rec,
          rec.metric_unit,
          rec.dimension,
          rec.dim_value
        );
      }
    }
  }

  return buckets;
}

function upsertBucket(
  buckets: Map<string, { key: AggKey; bucket: AggBucket }>,
  key: AggKey,
  rec: Ga4MetricPoint,
  unit: "count" | "percentage",
  dim: DimensionKey | "date",
  dimValue: string
): void {
  const bucketKey = JSON.stringify(key);
  let entry = buckets.get(bucketKey);
  if (!entry) {
    entry = {
      key,
      bucket: { rows: new Map(), unit, propertyId: rec.property_id },
    };
    buckets.set(bucketKey, entry);
  }
  const rk = rowKey(dim, dimValue);
  const existing = entry.bucket.rows.get(rk);
  if (existing) {
    existing.sum += rec.value;
    existing.count += 1;
  } else {
    entry.bucket.rows.set(rk, { sum: rec.value, count: 1 });
  }
}

function bucketToResponse(
  key: AggKey,
  bucket: AggBucket,
  today: Date
): { input: Record<string, unknown>; response: Record<string, unknown>; staleAfterSeconds: number } {
  const dateRange = rangeLabel(key.range, today);

  // ['overall' sentinel] indicates the time-series view with ['date'] dim
  const isTimeSeries =
    key.dimensions.length === 1 && (key.dimensions[0] as string) === "overall";

  const rows = Array.from(bucket.rows.entries()).map(([rk, agg]) => {
    const [dim, dimValue] = rk.split("::") as [DimensionKey | "date", string];
    const value = bucket.unit === "percentage" ? agg.sum / agg.count : agg.sum;
    // Build a dimensions object whose key matches what runGa4Query produced.
    const dimensions: Record<string, string> =
      dim === "date" ? { date: dimValue } : dim === "overall" ? {} : { [dim]: dimValue };
    return { dimensions, value };
  });

  // Reconstruct the input shape that ga4_query would have used.
  const input: Record<string, unknown> = {
    metric: key.metric,
    date_range: key.range,
    dimensions: isTimeSeries
      ? ["date"]
      : key.dimensions.length === 0
        ? undefined
        : key.dimensions,
    compare_to: null,
    property_id: bucket.propertyId,
  };
  // Drop undefined for canonicalization parity.
  if (input.dimensions === undefined) delete input.dimensions;

  const response = {
    rows,
    metric: key.metric,
    metric_unit: bucket.unit,
    date_range: dateRange,
    property_id: bucket.propertyId,
  };

  // Use the existing getStaleAfterSeconds helper so TTL semantics match
  // what the D1 cron was using.
  const staleAfterSeconds = getStaleAfterSeconds({
    metric: key.metric,
    date_range: key.range,
  });

  return { input, response, staleAfterSeconds };
}

// ─── Handler ────────────────────────────────────────────────

const handler: NangoHandlerFn = async (ctx): Promise<NangoHandlerResult> => {
  const admin = createAdminClient();
  const today = new Date();

  let totalRecords = 0;
  let metricsWritten = 0;
  const allBuckets = new Map<string, { key: AggKey; bucket: AggBucket }>();

  try {
    const summary = await fetchAllRecords<Ga4MetricPoint>(
      {
        connectionId: ctx.webhook.connectionId,
        providerConfigKey: ctx.webhook.providerConfigKey,
        model: "Ga4MetricPoint",
        modifiedAfter: ctx.webhook.modifiedAfter,
      },
      async (page) => {
        totalRecords += page.length;
        const partial = aggregate(page, today);
        // Merge partial into allBuckets
        for (const [k, v] of partial.entries()) {
          const existing = allBuckets.get(k);
          if (!existing) {
            allBuckets.set(k, v);
          } else {
            for (const [rk, agg] of v.bucket.rows.entries()) {
              const ex = existing.bucket.rows.get(rk);
              if (ex) {
                ex.sum += agg.sum;
                ex.count += agg.count;
              } else {
                existing.bucket.rows.set(rk, agg);
              }
            }
          }
        }
      }
    );

    // Write one cache row per aggregated bucket.
    for (const { key, bucket } of allBuckets.values()) {
      const { input, response, staleAfterSeconds } = bucketToResponse(key, bucket, today);
      try {
        await writeCachedMetric(admin, {
          account_id: ctx.accountId,
          source: "ga4",
          input,
          response,
          stale_after_seconds: staleAfterSeconds,
        });
        metricsWritten += 1;
      } catch {
        // Single bucket write failure shouldn't blow the whole sync.
        // The next sync will rewrite the row anyway.
      }
    }

    return {
      status: summary.capReached ? "partial" : "succeeded",
      recordsAdded: 0,
      recordsUpdated: metricsWritten,
      recordsDeleted: 0,
      errorClass: summary.capReached ? "page_cap_reached" : undefined,
      errorMessage: summary.capReached
        ? `Fetched ${totalRecords} records across ${summary.pages} pages; cap reached.`
        : undefined,
    };
  } catch (err) {
    if (err instanceof NangoMisconfiguredError) {
      return {
        status: "failed",
        recordsAdded: 0,
        recordsUpdated: metricsWritten,
        recordsDeleted: 0,
        errorClass: "nango_misconfigured",
        errorMessage: err.message,
      };
    }
    return {
      status: "failed",
      recordsAdded: 0,
      recordsUpdated: metricsWritten,
      recordsDeleted: 0,
      errorClass: "ingest_failed",
      errorMessage: err instanceof Error ? err.message : "unknown",
    };
  }
};

registerNangoHandler({
  providerConfigKey: "google-analytics",
  syncName: "ga4-daily-metrics",
  handler,
});

// Test exports
export { aggregate as _aggregate, bucketToResponse as _bucketToResponse };
