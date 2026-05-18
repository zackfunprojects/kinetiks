/**
 * Nango sync handler — Google Search Console (gsc-daily-performance).
 *
 * Slice 6 implementation. Fetches GscPerformancePoint records, aggregates
 * by (metric, range, dimension) into the cache-row shape, and stamps
 * kinetiks_metric_cache rows.
 *
 * Four GSC metrics surface in METRIC_REGISTRY:
 *   - gsc_impressions  (sum)
 *   - gsc_clicks       (sum)
 *   - gsc_ctr          (clicks/impressions; weighted average across days)
 *   - gsc_avg_position (impression-weighted average)
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRecords, NangoMisconfiguredError } from "../client";
import { registerNangoHandler } from ".";
import type { NangoHandlerFn, NangoHandlerResult } from "../types";
import { writeCachedMetric } from "@/lib/connections/metric-cache";

type GscMetricKey = "gsc_impressions" | "gsc_clicks" | "gsc_ctr" | "gsc_avg_position";
type GscDimensionKey = "overall" | "query" | "page";
type GscRangeKey = "last_7_days" | "last_28_days" | "last_90_days";

interface GscPerformancePoint {
  id: string;
  date: string;
  dimension: GscDimensionKey;
  dim_value: string;
  impressions: number;
  clicks: number;
  ctr: number;            // 0..1 from GSC
  position: number;
  site_url: string;
}

// TTL per range — GSC data has ~2 day reporting delay, so longer-windowed
// rows are stable for longer.
function getStaleAfterSeconds(range: GscRangeKey): number {
  switch (range) {
    case "last_7_days":
      return 60 * 60;        // 1 hour
    case "last_28_days":
      return 4 * 60 * 60;    // 4 hours
    case "last_90_days":
      return 24 * 60 * 60;   // 24 hours
  }
}

function isWithin(date: string, daysAgo: number, today: Date): boolean {
  const d = new Date(date);
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - daysAgo);
  return d >= cutoff && d <= today;
}

function rangeWindow(range: GscRangeKey): number {
  return range === "last_7_days" ? 7 : range === "last_28_days" ? 28 : 90;
}

function rangeLabel(range: GscRangeKey, today: Date): { start: string; end: string } {
  const end = today.toISOString().slice(0, 10);
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - rangeWindow(range));
  return { start: startDate.toISOString().slice(0, 10), end };
}

interface BucketKey {
  metric: GscMetricKey;
  range: GscRangeKey;
  dimensions: GscDimensionKey[];   // [] overall, ['date'] timeseries, [dim] per-dim slice
}

interface BucketRow {
  // Numerators / denominators for proper weighting on derived metrics
  sumImpressions: number;
  sumClicks: number;
  weightedPositionNumerator: number;     // sum(position * impressions)
  weightedPositionDenominator: number;   // sum(impressions)
  count: number;
}

interface AggBucket {
  rows: Map<string, BucketRow>;
  siteUrl: string;
}

function emptyRow(): BucketRow {
  return {
    sumImpressions: 0,
    sumClicks: 0,
    weightedPositionNumerator: 0,
    weightedPositionDenominator: 0,
    count: 0,
  };
}

function rowKey(dim: GscDimensionKey | "date", dimValue: string): string {
  return `${dim}::${dimValue}`;
}

function addToRow(row: BucketRow, rec: GscPerformancePoint): void {
  row.sumImpressions += rec.impressions;
  row.sumClicks += rec.clicks;
  row.weightedPositionNumerator += rec.position * rec.impressions;
  row.weightedPositionDenominator += rec.impressions;
  row.count += 1;
}

// ─── Aggregation ────────────────────────────────────────────

const METRICS: GscMetricKey[] = ["gsc_impressions", "gsc_clicks", "gsc_ctr", "gsc_avg_position"];
const RANGES: GscRangeKey[] = ["last_7_days", "last_28_days", "last_90_days"];

export function aggregateGsc(
  records: GscPerformancePoint[],
  today: Date
): Map<string, { key: BucketKey; bucket: AggBucket }> {
  const out = new Map<string, { key: BucketKey; bucket: AggBucket }>();

  for (const rec of records) {
    for (const range of RANGES) {
      if (!isWithin(rec.date, rangeWindow(range), today)) continue;
      // Query/page dimensions on 90d only when slice is the matching one.
      // overall slice contributes to:
      //   - overall scalar (no dim)
      //   - timeseries (date)
      // query/page slices contribute to per-dimension bucket only.

      for (const metric of METRICS) {
        if (rec.dimension === "overall") {
          // Overall scalar
          upsert(out, { metric, range, dimensions: [] }, rec, "overall", "");
          // Timeseries view (per-date)
          upsert(out, { metric, range, dimensions: ["overall"] }, rec, "date", rec.date);
        } else {
          upsert(out, { metric, range, dimensions: [rec.dimension] }, rec, rec.dimension, rec.dim_value);
        }
      }
    }
  }

  return out;
}

function upsert(
  buckets: Map<string, { key: BucketKey; bucket: AggBucket }>,
  key: BucketKey,
  rec: GscPerformancePoint,
  dim: GscDimensionKey | "date",
  dimValue: string
): void {
  const bk = JSON.stringify(key);
  let entry = buckets.get(bk);
  if (!entry) {
    entry = { key, bucket: { rows: new Map(), siteUrl: rec.site_url } };
    buckets.set(bk, entry);
  }
  const rk = rowKey(dim, dimValue);
  let row = entry.bucket.rows.get(rk);
  if (!row) {
    row = emptyRow();
    entry.bucket.rows.set(rk, row);
  }
  addToRow(row, rec);
}

// ─── Bucket → cache response shape ─────────────────────────

export function bucketToResponse(
  key: BucketKey,
  bucket: AggBucket,
  today: Date
): { input: Record<string, unknown>; response: Record<string, unknown>; staleAfterSeconds: number } {
  const dateRange = rangeLabel(key.range, today);
  const isTimeSeries = key.dimensions.length === 1 && key.dimensions[0] === "overall";

  const rows = Array.from(bucket.rows.entries()).map(([rk, row]) => {
    const [dim, dimValue] = rk.split("::") as [GscDimensionKey | "date", string];
    const dimensions: Record<string, string> =
      dim === "date" ? { date: dimValue } : dim === "overall" ? {} : { [dim]: dimValue };

    let value: number;
    switch (key.metric) {
      case "gsc_impressions":
        value = row.sumImpressions;
        break;
      case "gsc_clicks":
        value = row.sumClicks;
        break;
      case "gsc_ctr":
        value = row.sumImpressions > 0 ? (row.sumClicks / row.sumImpressions) * 100 : 0;
        break;
      case "gsc_avg_position":
        value =
          row.weightedPositionDenominator > 0
            ? row.weightedPositionNumerator / row.weightedPositionDenominator
            : 0;
        break;
    }
    return { dimensions, value };
  });

  const unit: "count" | "percentage" | "ratio" =
    key.metric === "gsc_ctr"
      ? "percentage"
      : key.metric === "gsc_avg_position"
        ? "ratio"
        : "count";

  const input: Record<string, unknown> = {
    metric: key.metric,
    date_range: key.range,
    dimensions: isTimeSeries
      ? ["date"]
      : key.dimensions.length === 0
        ? undefined
        : key.dimensions,
    site_url: bucket.siteUrl,
  };
  if (input.dimensions === undefined) delete input.dimensions;

  const response = {
    rows,
    metric: key.metric,
    metric_unit: unit,
    date_range: dateRange,
    site_url: bucket.siteUrl,
  };

  return { input, response, staleAfterSeconds: getStaleAfterSeconds(key.range) };
}

// ─── Handler ────────────────────────────────────────────────

const handler: NangoHandlerFn = async (ctx): Promise<NangoHandlerResult> => {
  const admin = createAdminClient();
  const today = new Date();
  let totalRecords = 0;
  let metricsWritten = 0;
  const allBuckets = new Map<string, { key: BucketKey; bucket: AggBucket }>();

  try {
    const summary = await fetchAllRecords<GscPerformancePoint>(
      {
        connectionId: ctx.webhook.connectionId,
        providerConfigKey: ctx.webhook.providerConfigKey,
        model: "GscPerformancePoint",
        modifiedAfter: ctx.webhook.modifiedAfter,
      },
      async (page) => {
        totalRecords += page.length;
        const partial = aggregateGsc(page, today);
        for (const [k, v] of partial.entries()) {
          const existing = allBuckets.get(k);
          if (!existing) {
            allBuckets.set(k, v);
          } else {
            for (const [rk, agg] of v.bucket.rows.entries()) {
              const ex = existing.bucket.rows.get(rk);
              if (ex) {
                ex.sumImpressions += agg.sumImpressions;
                ex.sumClicks += agg.sumClicks;
                ex.weightedPositionNumerator += agg.weightedPositionNumerator;
                ex.weightedPositionDenominator += agg.weightedPositionDenominator;
                ex.count += agg.count;
              } else {
                existing.bucket.rows.set(rk, agg);
              }
            }
          }
        }
      }
    );

    for (const { key, bucket } of allBuckets.values()) {
      const { input, response, staleAfterSeconds } = bucketToResponse(key, bucket, today);
      try {
        await writeCachedMetric(admin, {
          account_id: ctx.accountId,
          source: "gsc",
          input,
          response,
          stale_after_seconds: staleAfterSeconds,
        });
        metricsWritten += 1;
      } catch {
        // single failure non-fatal
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
  providerConfigKey: "google-search-console",
  syncName: "gsc-daily-performance",
  handler,
});

export { aggregateGsc as _aggregateGsc, bucketToResponse as _bucketToResponse };
