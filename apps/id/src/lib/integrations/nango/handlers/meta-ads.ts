/**
 * Nango sync handler — Meta Ads (meta-ads-campaigns).
 *
 * Slice 7 implementation. Receives MetaAdsCampaignInsight records (one
 * per campaign × date) and aggregates to:
 *   - 9 meta_* account-level metrics over last_7 / last_28 / last_90 days
 *   - Per-campaign dim slices for last_28_days
 *
 * Same bucket/cache contract as GA4/GSC: input includes the dimension
 * list and date range; the cache row's response carries metric, rows,
 * unit, and date_range fields the meta_ads_query tool reads back.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRecords, NangoMisconfiguredError } from "../client";
import { registerNangoHandler } from ".";
import type { NangoHandlerFn, NangoHandlerResult } from "../types";
import { writeCachedMetric } from "@/lib/connections/metric-cache";

type MetaMetricKey =
  | "meta_spend"
  | "meta_impressions"
  | "meta_clicks"
  | "meta_ctr"
  | "meta_cpc"
  | "meta_cpm"
  | "meta_conversions"
  | "meta_conversion_value"
  | "meta_roas";

type MetaDimensionKey = "overall" | "campaign";
type MetaRangeKey = "last_7_days" | "last_28_days" | "last_90_days";

interface MetaCampaignInsight {
  id: string;
  ad_account_id: string;
  campaign_id: string;
  campaign_name: string;
  objective: string;
  status: string;
  date: string;
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  cpm: number;
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

function rangeWindow(range: MetaRangeKey): number {
  return range === "last_7_days" ? 7 : range === "last_28_days" ? 28 : 90;
}

function rangeLabel(range: MetaRangeKey, today: Date): { start: string; end: string } {
  const end = today.toISOString().slice(0, 10);
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - rangeWindow(range));
  return { start: startDate.toISOString().slice(0, 10), end };
}

function staleAfterSeconds(range: MetaRangeKey): number {
  return range === "last_7_days" ? 60 * 60 : range === "last_28_days" ? 2 * 60 * 60 : 24 * 60 * 60;
}

// Aggregator: per (metric, range, dimension), accumulates the raw
// components and computes derived metrics on emission.
interface AggKey {
  range: MetaRangeKey;
  dimension: MetaDimensionKey;
}

interface RowAccumulator {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  reach: number;
  count: number;
}

interface DimMap {
  rows: Map<string, RowAccumulator>;
  adAccountId: string;
}

const METRICS: MetaMetricKey[] = [
  "meta_spend",
  "meta_impressions",
  "meta_clicks",
  "meta_ctr",
  "meta_cpc",
  "meta_cpm",
  "meta_conversions",
  "meta_conversion_value",
  "meta_roas",
];

const RANGES: MetaRangeKey[] = ["last_7_days", "last_28_days", "last_90_days"];

function emptyRow(): RowAccumulator {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    conversionValue: 0,
    reach: 0,
    count: 0,
  };
}

function addRow(target: RowAccumulator, src: MetaCampaignInsight): void {
  target.spend += src.spend;
  target.impressions += src.impressions;
  target.clicks += src.clicks;
  target.conversions += src.conversions;
  target.conversionValue += src.conversion_value;
  target.reach += src.reach;
  target.count += 1;
}

export function aggregateMeta(
  records: MetaCampaignInsight[],
  today: Date
): Map<string, { key: AggKey; bucket: DimMap }> {
  const buckets = new Map<string, { key: AggKey; bucket: DimMap }>();

  for (const rec of records) {
    for (const range of RANGES) {
      if (!isWithin(rec.date, rangeWindow(range), today)) continue;
      // Skip campaign-dimension slice for 90d to keep payload sane
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
  rec: MetaCampaignInsight,
  dimValue: string
): void {
  const bk = JSON.stringify(key);
  let entry = buckets.get(bk);
  if (!entry) {
    entry = { key, bucket: { rows: new Map(), adAccountId: rec.ad_account_id } };
    buckets.set(bk, entry);
  }
  let row = entry.bucket.rows.get(dimValue);
  if (!row) {
    row = emptyRow();
    entry.bucket.rows.set(dimValue, row);
  }
  addRow(row, rec);
}

function computeValue(metric: MetaMetricKey, row: RowAccumulator): number {
  switch (metric) {
    case "meta_spend":
      return row.spend;
    case "meta_impressions":
      return row.impressions;
    case "meta_clicks":
      return row.clicks;
    case "meta_conversions":
      return row.conversions;
    case "meta_conversion_value":
      return row.conversionValue;
    case "meta_ctr":
      return row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
    case "meta_cpc":
      return row.clicks > 0 ? row.spend / row.clicks : 0;
    case "meta_cpm":
      return row.impressions > 0 ? (row.spend / row.impressions) * 1000 : 0;
    case "meta_roas":
      return row.spend > 0 ? row.conversionValue / row.spend : 0;
  }
}

function metricUnit(metric: MetaMetricKey): "count" | "currency" | "percentage" | "ratio" {
  switch (metric) {
    case "meta_impressions":
    case "meta_clicks":
    case "meta_conversions":
      return "count";
    case "meta_spend":
    case "meta_conversion_value":
    case "meta_cpc":
    case "meta_cpm":
      return "currency";
    case "meta_ctr":
      return "percentage";
    case "meta_roas":
      return "ratio";
  }
}

export function bucketToResponse(
  metric: MetaMetricKey,
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
    ad_account_id: bucket.adAccountId,
  };
  if (input.dimensions === undefined) delete input.dimensions;

  return {
    input,
    response: {
      rows,
      metric,
      metric_unit: metricUnit(metric),
      date_range: dateRange,
      ad_account_id: bucket.adAccountId,
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
    const summary = await fetchAllRecords<MetaCampaignInsight>(
      {
        connectionId: ctx.webhook.connectionId,
        providerConfigKey: ctx.webhook.providerConfigKey,
        model: "MetaAdsCampaignInsight",
        modifiedAfter: ctx.webhook.modifiedAfter,
      },
      async (page) => {
        totalRecords += page.length;
        const partial = aggregateMeta(page, today);
        for (const [k, v] of partial.entries()) {
          const existing = allBuckets.get(k);
          if (!existing) {
            allBuckets.set(k, v);
          } else {
            for (const [rk, agg] of v.bucket.rows.entries()) {
              const ex = existing.bucket.rows.get(rk);
              if (ex) {
                ex.spend += agg.spend;
                ex.impressions += agg.impressions;
                ex.clicks += agg.clicks;
                ex.conversions += agg.conversions;
                ex.conversionValue += agg.conversionValue;
                ex.reach += agg.reach;
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
            source: "meta_ads",
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
  providerConfigKey: "facebook",
  syncName: "meta-ads-campaigns",
  handler,
});

export { aggregateMeta as _aggregateMeta, bucketToResponse as _bucketToResponse, computeValue as _computeValue };
