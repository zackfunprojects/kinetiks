/**
 * Tests for the Meta Ads handler's pure aggregations.
 *
 * Locks down:
 *   - Bucket creation per (range, dimension)
 *   - Window filtering (last_90_days only emits overall, not per-campaign)
 *   - computeValue derives CTR / CPC / CPM / ROAS from accumulated raws
 */

import { describe, expect, it } from "vitest";

import {
  _aggregateMeta,
  _bucketToResponse,
  _computeValue,
} from "../handlers/meta-ads";

const TODAY = new Date("2026-05-17T00:00:00Z");

interface MetaFx {
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

function r(overrides: Partial<MetaFx> = {}): MetaFx {
  return {
    id: "x",
    ad_account_id: "acc_1",
    campaign_id: "cmp_1",
    campaign_name: "Brand",
    objective: "CONVERSIONS",
    status: "ACTIVE",
    date: "2026-05-15",
    impressions: 10000,
    reach: 8000,
    clicks: 200,
    spend: 100,
    ctr: 2,
    cpc: 0.5,
    cpm: 10,
    conversions: 10,
    conversion_value: 500,
    roas: 5,
    ...overrides,
  };
}

describe("aggregateMeta — bucket creation", () => {
  it("creates overall + campaign slices for 7d/28d, overall-only for 90d", () => {
    const buckets = _aggregateMeta([r()], TODAY);
    const keys = Array.from(buckets.values()).map(
      (b) => `${b.key.range}/${b.key.dimension}`
    );
    expect(keys.sort()).toEqual([
      "last_28_days/campaign",
      "last_28_days/overall",
      "last_7_days/campaign",
      "last_7_days/overall",
      "last_90_days/overall",
    ]);
  });

  it("filters records outside window", () => {
    const buckets = _aggregateMeta([r({ date: "2025-12-01" })], TODAY);
    expect(buckets.size).toBe(0);
  });
});

describe("computeValue — derived metric math", () => {
  it("meta_spend / impressions / clicks / conversions are sums", () => {
    const acc = {
      spend: 200,
      impressions: 5000,
      clicks: 100,
      conversions: 5,
      conversionValue: 500,
      reach: 3000,
      count: 2,
    };
    expect(_computeValue("meta_spend", acc)).toBe(200);
    expect(_computeValue("meta_impressions", acc)).toBe(5000);
    expect(_computeValue("meta_clicks", acc)).toBe(100);
    expect(_computeValue("meta_conversions", acc)).toBe(5);
    expect(_computeValue("meta_conversion_value", acc)).toBe(500);
  });

  it("meta_ctr is clicks / impressions × 100", () => {
    const acc = {
      spend: 0,
      impressions: 10000,
      clicks: 200,
      conversions: 0,
      conversionValue: 0,
      reach: 0,
      count: 1,
    };
    expect(_computeValue("meta_ctr", acc)).toBe(2);
  });

  it("meta_cpc is spend / clicks", () => {
    const acc = {
      spend: 100,
      impressions: 0,
      clicks: 200,
      conversions: 0,
      conversionValue: 0,
      reach: 0,
      count: 1,
    };
    expect(_computeValue("meta_cpc", acc)).toBe(0.5);
  });

  it("meta_cpm is spend / impressions × 1000", () => {
    const acc = {
      spend: 100,
      impressions: 10000,
      clicks: 0,
      conversions: 0,
      conversionValue: 0,
      reach: 0,
      count: 1,
    };
    expect(_computeValue("meta_cpm", acc)).toBe(10);
  });

  it("meta_roas is conversionValue / spend", () => {
    const acc = {
      spend: 100,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      conversionValue: 500,
      reach: 0,
      count: 1,
    };
    expect(_computeValue("meta_roas", acc)).toBe(5);
  });

  it("derived metrics return 0 (not NaN) on zero divisor", () => {
    const zero = {
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      conversionValue: 0,
      reach: 0,
      count: 0,
    };
    expect(_computeValue("meta_ctr", zero)).toBe(0);
    expect(_computeValue("meta_cpc", zero)).toBe(0);
    expect(_computeValue("meta_cpm", zero)).toBe(0);
    expect(_computeValue("meta_roas", zero)).toBe(0);
  });
});

describe("bucketToResponse — output shape", () => {
  it("input includes ad_account_id for cache-key parity with the tool", () => {
    const buckets = _aggregateMeta([r({ ad_account_id: "acc_42" })], TODAY);
    const overall28d = Array.from(buckets.values()).find(
      (b) => b.key.range === "last_28_days" && b.key.dimension === "overall"
    )!;
    const { input } = _bucketToResponse("meta_spend", overall28d.key, overall28d.bucket, TODAY);
    expect(input).toMatchObject({ ad_account_id: "acc_42", metric: "meta_spend" });
  });
});
