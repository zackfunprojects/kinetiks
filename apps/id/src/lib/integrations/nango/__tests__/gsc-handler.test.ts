/**
 * Tests for the GSC webhook handler's pure aggregation logic.
 *
 * Locks down:
 *   - Aggregation produces buckets per (metric, range, dimension)
 *   - gsc_ctr is impression-weighted, not simple average
 *   - gsc_avg_position is impression-weighted
 *   - gsc_impressions / gsc_clicks are simple sums
 *   - Date windows filter correctly
 */

import { describe, expect, it } from "vitest";

import {
  _aggregateGsc,
  _bucketToResponse,
} from "../handlers/google-search-console";

const TODAY = new Date("2026-05-17T00:00:00Z");

interface RawGsc {
  id: string;
  date: string;
  dimension: "overall" | "query" | "page";
  dim_value: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  site_url: string;
}

function p(overrides: Partial<RawGsc> = {}): RawGsc {
  return {
    id: "r1",
    date: "2026-05-15",
    dimension: "overall",
    dim_value: "",
    impressions: 1000,
    clicks: 50,
    ctr: 0.05,
    position: 8.5,
    site_url: "https://example.com",
    ...overrides,
  };
}

describe("aggregateGsc — bucket creation", () => {
  it("emits 4 metric buckets per range for an overall record (impressions/clicks/ctr/position)", () => {
    const buckets = _aggregateGsc([p()], TODAY);
    // Each record produces 4 metrics × 3 ranges × 2 views (overall + timeseries) = 24 buckets
    expect(buckets.size).toBe(24);
  });

  it("query dimension produces buckets only at the per-dim slice (not overall)", () => {
    const buckets = _aggregateGsc(
      [p({ dimension: "query", dim_value: "best crm" })],
      TODAY
    );
    const overall = Array.from(buckets.values()).filter(
      (b) => b.key.dimensions.length === 0
    );
    expect(overall).toHaveLength(0);

    const perDim = Array.from(buckets.values()).filter(
      (b) => b.key.dimensions[0] === "query"
    );
    // 4 metrics × 3 ranges
    expect(perDim).toHaveLength(12);
  });

  it("filters records outside the date window", () => {
    const buckets = _aggregateGsc([p({ date: "2025-12-01" })], TODAY);
    expect(buckets.size).toBe(0);
  });
});

describe("bucketToResponse — derived metric math", () => {
  it("gsc_impressions sums impressions", () => {
    const buckets = _aggregateGsc(
      [
        p({ date: "2026-05-15", impressions: 1000, clicks: 50 }),
        p({ date: "2026-05-16", impressions: 500, clicks: 25, id: "r2" }),
      ],
      TODAY
    );
    const overallImps = Array.from(buckets.values()).find(
      (b) =>
        b.key.metric === "gsc_impressions" &&
        b.key.range === "last_7_days" &&
        b.key.dimensions.length === 0
    )!;
    const { response } = _bucketToResponse(overallImps.key, overallImps.bucket, TODAY);
    const value = (response as { rows: Array<{ value: number }> }).rows[0]!.value;
    expect(value).toBe(1500);
  });

  it("gsc_ctr is impression-weighted (clicks / impressions)", () => {
    const buckets = _aggregateGsc(
      [
        p({ date: "2026-05-15", impressions: 900, clicks: 100 }),  // 11.11%
        p({ date: "2026-05-16", impressions: 100, clicks: 1, id: "r2" }),  // 1%
      ],
      TODAY
    );
    const overallCtr = Array.from(buckets.values()).find(
      (b) =>
        b.key.metric === "gsc_ctr" &&
        b.key.range === "last_7_days" &&
        b.key.dimensions.length === 0
    )!;
    const { response } = _bucketToResponse(overallCtr.key, overallCtr.bucket, TODAY);
    const value = (response as { rows: Array<{ value: number }> }).rows[0]!.value;
    // (100 + 1) / (900 + 100) * 100 = 10.1, NOT (11.11 + 1) / 2
    expect(value).toBeCloseTo(10.1, 2);
  });

  it("gsc_avg_position is impression-weighted", () => {
    const buckets = _aggregateGsc(
      [
        p({ date: "2026-05-15", impressions: 1000, position: 10 }),
        p({ date: "2026-05-16", impressions: 100, position: 1, id: "r2" }),
      ],
      TODAY
    );
    const overallPos = Array.from(buckets.values()).find(
      (b) =>
        b.key.metric === "gsc_avg_position" &&
        b.key.range === "last_7_days" &&
        b.key.dimensions.length === 0
    )!;
    const { response } = _bucketToResponse(overallPos.key, overallPos.bucket, TODAY);
    const value = (response as { rows: Array<{ value: number }> }).rows[0]!.value;
    // (10 * 1000 + 1 * 100) / 1100 = 10100/1100 ≈ 9.18
    expect(value).toBeCloseTo(9.18, 1);
  });

  it("returns zero gsc_ctr when impressions are zero (no divide-by-zero)", () => {
    const buckets = _aggregateGsc(
      [p({ impressions: 0, clicks: 0, ctr: 0 })],
      TODAY
    );
    const ctr = Array.from(buckets.values()).find(
      (b) =>
        b.key.metric === "gsc_ctr" &&
        b.key.range === "last_7_days" &&
        b.key.dimensions.length === 0
    )!;
    const { response } = _bucketToResponse(ctr.key, ctr.bucket, TODAY);
    expect((response as { rows: Array<{ value: number }> }).rows[0]!.value).toBe(0);
  });
});

describe("bucketToResponse — input shape parity", () => {
  it("input includes site_url so the gsc_query tool's cache key matches", () => {
    const buckets = _aggregateGsc(
      [p({ site_url: "https://acme.test" })],
      TODAY
    );
    const someBucket = Array.from(buckets.values())[0]!;
    const { input } = _bucketToResponse(someBucket.key, someBucket.bucket, TODAY);
    expect(input).toMatchObject({ site_url: "https://acme.test" });
  });
});
