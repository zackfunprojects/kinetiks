/**
 * Tests for the Google Ads handler's pure aggregations.
 * Mirrors meta-ads-handler.test.ts but on the gads_* metric set.
 */

import { describe, expect, it } from "vitest";

import {
  _aggregateGoogleAds,
  _bucketToResponse,
  _computeValue,
} from "../handlers/google-ads";

const TODAY = new Date("2026-05-17T00:00:00Z");

interface GadsFx {
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

function r(o: Partial<GadsFx> = {}): GadsFx {
  return {
    id: "x",
    customer_id: "cust_1",
    campaign_id: "cmp_1",
    campaign_name: "Brand SEM",
    status: "ENABLED",
    advertising_channel_type: "SEARCH",
    date: "2026-05-15",
    impressions: 5000,
    clicks: 250,
    cost: 125,
    ctr: 5,
    cpc: 0.5,
    conversions: 10,
    conversion_value: 800,
    roas: 6.4,
    ...o,
  };
}

describe("aggregateGoogleAds", () => {
  it("creates overall + campaign for 7d/28d, overall-only for 90d", () => {
    const buckets = _aggregateGoogleAds([r()], TODAY);
    expect(buckets.size).toBe(5);
  });

  it("filters records outside window", () => {
    const buckets = _aggregateGoogleAds([r({ date: "2025-12-01" })], TODAY);
    expect(buckets.size).toBe(0);
  });
});

describe("computeValue", () => {
  it("gads_spend is the cost sum", () => {
    const acc = {
      cost: 500,
      impressions: 1000,
      clicks: 50,
      conversions: 5,
      conversionValue: 300,
      count: 2,
    };
    expect(_computeValue("gads_spend", acc)).toBe(500);
  });

  it("gads_ctr is clicks / impressions × 100", () => {
    const acc = {
      cost: 0,
      impressions: 5000,
      clicks: 250,
      conversions: 0,
      conversionValue: 0,
      count: 1,
    };
    expect(_computeValue("gads_ctr", acc)).toBe(5);
  });

  it("gads_cpc is cost / clicks", () => {
    const acc = {
      cost: 100,
      impressions: 0,
      clicks: 200,
      conversions: 0,
      conversionValue: 0,
      count: 1,
    };
    expect(_computeValue("gads_cpc", acc)).toBe(0.5);
  });

  it("gads_roas is conversionValue / cost", () => {
    const acc = {
      cost: 100,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      conversionValue: 600,
      count: 1,
    };
    expect(_computeValue("gads_roas", acc)).toBe(6);
  });

  it("zero divisors return 0", () => {
    const zero = {
      cost: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      conversionValue: 0,
      count: 0,
    };
    expect(_computeValue("gads_ctr", zero)).toBe(0);
    expect(_computeValue("gads_cpc", zero)).toBe(0);
    expect(_computeValue("gads_roas", zero)).toBe(0);
  });
});

describe("bucketToResponse", () => {
  it("input includes customer_id for cache-key parity", () => {
    const buckets = _aggregateGoogleAds([r({ customer_id: "cust_99" })], TODAY);
    const overall = Array.from(buckets.values()).find(
      (b) => b.key.range === "last_28_days" && b.key.dimension === "overall"
    )!;
    const { input } = _bucketToResponse("gads_spend", overall.key, overall.bucket, TODAY);
    expect(input).toMatchObject({ customer_id: "cust_99", metric: "gads_spend" });
  });
});
