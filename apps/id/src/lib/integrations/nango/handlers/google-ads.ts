/**
 * Nango sync handler — Google Ads (google-ads-campaigns).
 *
 * Slice 7 implementation. Receives GoogleAdsCampaignInsight records and
 * mirrors the Meta Ads aggregation pattern. 8 gads_* metrics over 3
 * windows × 2 dimension slices (overall + campaign).
 *
 * Cost is already in dollars by the time it reaches the handler — the
 * Nango sync script divides cost_micros by 1e6 before persistence.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRecords, NangoMisconfiguredError } from "../client";
import { registerNangoHandler } from ".";
import type { NangoHandlerFn, NangoHandlerResult } from "../types";
import { writeCachedMetric } from "@/lib/connections/metric-cache";

type GadsMetricKey =
  | "gads_spend"
  | "gads_impressions"
  | "gads_clicks"
  | "gads_ctr"
  | "gads_cpc"
  | "gads_conversions"
  | "gads_conversion_value"
  | "gads_roas";

type GadsDimensionKey = "overall" | "campaign";
type GadsRangeKey = "last_7_days" | "last_28_days" | "last_90_days";

interface GoogleAdsCampaignInsight {
  id: string;
  customer_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  advertising_channel_type: string;
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  ctr: number;
  cpc: number;
  conversions: number;
  conversion_value: number;
  roas: number;
}

function isWithin(date: string, daysAgo: number, today: Date): boolean {
  const d = new Date(date);
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - daysAgo);
  return d >= cutoff && d <= today;
}

function rangeWindow(range: GadsRangeKey): number {
  return range === "last_7_days" ? 7 : range === "last_28_days" ? 28 : 90;
}

function rangeLabel(range: GadsRangeKey, today: Date): { start: string; end: string } {
  const end = today.toISOString().slice(0, 10);
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - rangeWindow(range));
  return { start: startDate.toISOString().slice(0, 10), end };
}

function staleAfterSeconds(range: GadsRangeKey): number {
  return range === "last_7_days" ? 60 * 60 : range === "last_28_days" ? 2 * 60 * 60 : 24 * 60 * 60;
}

interface AggKey {
  range: GadsRangeKey;
  dimension: GadsDimensionKey;
}

interface RowAccumulator {
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  count: number;
}

interface DimMap {
  rows: Map<string, RowAccumulator>;
  customerId: string;
}

const METRICS: GadsMetricKey[] = [
  "gads_spend",
  "gads_impressions",
  "gads_clicks",
  "gads_ctr",
  "gads_cpc",
  "gads_conversions",
  "gads_conversion_value",
  "gads_roas",
];

const RANGES: GadsRangeKey[] = ["last_7_days", "last_28_days", "last_90_days"];

function emptyRow(): RowAccumulator {
  return {
    cost: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    conversionValue: 0,
    count: 0,
  };
}

function addRow(target: RowAccumulator, src: GoogleAdsCampaignInsight): void {
  target.cost += src.cost;
  target.impressions += src.impressions;
  target.clicks += src.clicks;
  target.conversions += src.conversions;
  target.conversionValue += src.conversion_value;
  target.count += 1;
}

export function aggregateGoogleAds(
  records: GoogleAdsCampaignInsight[],
  today: Date
): Map<string, { key: AggKey; bucket: DimMap }> {
  const buckets = new Map<string, { key: AggKey; bucket: DimMap }>();

  for (const rec of records) {
    for (const range of RANGES) {
      if (!isWithin(rec.date, rangeWindow(range), today)) continue;
      if (range === "last_90_days") {
        upsert(buckets, { range, dimension: "overall" }, rec, "");
      } else {
        upsert(buckets, { range, dimension: "overall" }, rec, "");
        upsert(buckets, { range, dimension: "campaign" }, rec, rec.campaign_id);
      }
    }
  }
  return buckets;
}

function upsert(
  buckets: Map<string, { key: AggKey; bucket: DimMap }>,
  key: AggKey,
  rec: GoogleAdsCampaignInsight,
  dimValue: string
): void {
  const bk = JSON.stringify(key);
  let entry = buckets.get(bk);
  if (!entry) {
    entry = { key, bucket: { rows: new Map(), customerId: rec.customer_id } };
    buckets.set(bk, entry);
  }
  let row = entry.bucket.rows.get(dimValue);
  if (!row) {
    row = emptyRow();
    entry.bucket.rows.set(dimValue, row);
  }
  addRow(row, rec);
}

function computeValue(metric: GadsMetricKey, row: RowAccumulator): number {
  switch (metric) {
    case "gads_spend":
      return row.cost;
    case "gads_impressions":
      return row.impressions;
    case "gads_clicks":
      return row.clicks;
    case "gads_conversions":
      return row.conversions;
    case "gads_conversion_value":
      return row.conversionValue;
    case "gads_ctr":
      return row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
    case "gads_cpc":
      return row.clicks > 0 ? row.cost / row.clicks : 0;
    case "gads_roas":
      return row.cost > 0 ? row.conversionValue / row.cost : 0;
  }
}

function metricUnit(metric: GadsMetricKey): "count" | "currency" | "percentage" | "ratio" {
  switch (metric) {
    case "gads_impressions":
    case "gads_clicks":
    case "gads_conversions":
      return "count";
    case "gads_spend":
    case "gads_conversion_value":
    case "gads_cpc":
      return "currency";
    case "gads_ctr":
      return "percentage";
    case "gads_roas":
      return "ratio";
  }
}

export function bucketToResponse(
  metric: GadsMetricKey,
  key: AggKey,
  bucket: DimMap,
  today: Date
): { input: Record<string, unknown>; response: Record<string, unknown>; staleAfterSecondsValue: number } {
  const dateRange = rangeLabel(key.range, today);
  const rows = Array.from(bucket.rows.entries()).map(([dimValue, agg]) => {
    const dimensions: Record<string, string> =
      key.dimension === "overall" ? {} : { campaign: dimValue };
    return { dimensions, value: computeValue(metric, agg) };
  });

  const input: Record<string, unknown> = {
    metric,
    date_range: key.range,
    dimensions: key.dimension === "overall" ? undefined : [key.dimension],
    customer_id: bucket.customerId,
  };
  if (input.dimensions === undefined) delete input.dimensions;

  return {
    input,
    response: {
      rows,
      metric,
      metric_unit: metricUnit(metric),
      date_range: dateRange,
      customer_id: bucket.customerId,
    },
    staleAfterSecondsValue: staleAfterSeconds(key.range),
  };
}

const handler: NangoHandlerFn = async (ctx): Promise<NangoHandlerResult> => {
  const admin = createAdminClient();
  const today = new Date();
  let totalRecords = 0;
  let metricsWritten = 0;
  const allBuckets = new Map<string, { key: AggKey; bucket: DimMap }>();

  try {
    const summary = await fetchAllRecords<GoogleAdsCampaignInsight>(
      {
        connectionId: ctx.webhook.connectionId,
        providerConfigKey: ctx.webhook.providerConfigKey,
        model: "GoogleAdsCampaignInsight",
        modifiedAfter: ctx.webhook.modifiedAfter,
      },
      async (page) => {
        totalRecords += page.length;
        const partial = aggregateGoogleAds(page, today);
        for (const [k, v] of partial.entries()) {
          const existing = allBuckets.get(k);
          if (!existing) {
            allBuckets.set(k, v);
          } else {
            for (const [rk, agg] of v.bucket.rows.entries()) {
              const ex = existing.bucket.rows.get(rk);
              if (ex) {
                ex.cost += agg.cost;
                ex.impressions += agg.impressions;
                ex.clicks += agg.clicks;
                ex.conversions += agg.conversions;
                ex.conversionValue += agg.conversionValue;
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
      for (const metric of METRICS) {
        const { input, response, staleAfterSecondsValue } = bucketToResponse(metric, key, bucket, today);
        try {
          await writeCachedMetric(admin, {
            account_id: ctx.accountId,
            source: "google_ads",
            input,
            response,
            stale_after_seconds: staleAfterSecondsValue,
          });
          metricsWritten += 1;
        } catch {
          // single failure non-fatal
        }
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
  providerConfigKey: "google-ads",
  syncName: "google-ads-campaigns",
  handler,
});

export { aggregateGoogleAds as _aggregateGoogleAds, bucketToResponse as _bucketToResponse, computeValue as _computeValue };
