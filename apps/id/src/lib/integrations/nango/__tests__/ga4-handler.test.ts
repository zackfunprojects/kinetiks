/**
 * Tests for the GA4 Nango webhook handler's pure aggregation logic.
 *
 * The DB write path (writeCachedMetric calls) is covered by the
 * integration test in Slice 10. Here we lock down:
 *   - Aggregation groups records by (metric, range, dimensions)
 *   - Date filtering for last_7 / last_28 / last_90 windows
 *   - Overall slice → per-date time-series view emitted
 *   - Bucket → response shape matches D1's runGa4Query output
 *   - Percentage metrics average; count metrics sum
 */

import { describe, expect, it } from "vitest";

import { _aggregate, _bucketToResponse } from "../handlers/google-analytics";

const TODAY = new Date("2026-05-17T00:00:00Z");

interface RawPoint {
  id: string;
  metric: "ga4_sessions" | "ga4_users" | "ga4_bounce_rate";
  property_id: string;
  date: string;
  dimension: "overall" | "country" | "device" | "source" | "medium" | "page_path";
  dim_value: string;
  value: number;
  metric_unit: "count" | "percentage";
}

function p(overrides: Partial<RawPoint> = {}): RawPoint {
  return {
    id: "x",
    metric: "ga4_sessions",
    property_id: "12345",
    date: "2026-05-15",
    dimension: "overall",
    dim_value: "",
    value: 100,
    metric_unit: "count",
    ...overrides,
  };
}

describe("aggregate — overall slice", () => {
  it("emits one bucket for last_7_days × overall when dates are recent", () => {
    const buckets = _aggregate([p({ date: "2026-05-15", value: 100 })], TODAY);
    const overall7 = Array.from(buckets.values()).find(
      (b) => b.key.metric === "ga4_sessions" && b.key.range === "last_7_days" && b.key.dimensions.length === 0
    );
    expect(overall7).toBeDefined();
    expect(overall7!.bucket.rows.size).toBe(1);
  });

  it("emits buckets for ALL three windows when the date is within 7 days", () => {
    const buckets = _aggregate([p({ date: "2026-05-15", value: 100 })], TODAY);
    const ranges = Array.from(buckets.values())
      .filter((b) => b.key.dimensions.length === 0)
      .map((b) => b.key.range)
      .sort();
    expect(ranges).toEqual(["last_28_days", "last_7_days", "last_90_days"]);
  });

  it("includes a per-date time-series bucket alongside the overall scalar", () => {
    const buckets = _aggregate([p({ date: "2026-05-15", value: 100 })], TODAY);
    // ['overall'] dimensions array is the sentinel for ['date'] time series.
    const timeSeries = Array.from(buckets.values()).find(
      (b) => b.key.dimensions.length === 1 && (b.key.dimensions[0] as string) === "overall"
    );
    expect(timeSeries).toBeDefined();
  });

  it("excludes records outside the window from short ranges", () => {
    // Date 30 days ago: in 90d, NOT in 28d or 7d.
    const buckets = _aggregate([p({ date: "2026-04-15", value: 100 })], TODAY);
    const dim0 = Array.from(buckets.values()).filter(
      (b) => b.key.dimensions.length === 0
    );
    const ranges = dim0.map((b) => b.key.range).sort();
    expect(ranges).toEqual(["last_90_days"]);
  });
});

describe("aggregate — per-dimension slice", () => {
  it("emits one bucket per (metric, range, dimension) tuple", () => {
    const points: RawPoint[] = [
      p({ dimension: "device", dim_value: "mobile", value: 60 }),
      p({ dimension: "device", dim_value: "desktop", value: 40 }),
    ];
    const buckets = _aggregate(points, TODAY);
    const deviceBuckets = Array.from(buckets.values()).filter(
      (b) =>
        b.key.dimensions.length === 1 &&
        b.key.dimensions[0] === "device" &&
        b.key.metric === "ga4_sessions"
    );
    // One per range (7/28/90), each with 2 rows (mobile + desktop).
    expect(deviceBuckets).toHaveLength(3);
    for (const b of deviceBuckets) {
      expect(b.bucket.rows.size).toBe(2);
    }
  });

  it("page_path NOT emitted for last_90_days (only 28d window)", () => {
    const points: RawPoint[] = [p({ dimension: "page_path", dim_value: "/home" })];
    const buckets = _aggregate(points, TODAY);
    const pp90 = Array.from(buckets.values()).find(
      (b) => b.key.range === "last_90_days" && b.key.dimensions[0] === "page_path"
    );
    expect(pp90).toBeUndefined();
  });
});

describe("aggregate — percentage averaging vs count summing", () => {
  it("count metrics sum across multiple emissions on the same date", () => {
    const points: RawPoint[] = [
      p({ date: "2026-05-15", value: 100 }),
      // Note: two records with same date+dim is unusual but handle gracefully.
      p({ id: "y", date: "2026-05-15", value: 50 }),
    ];
    const buckets = _aggregate(points, TODAY);
    const ts = Array.from(buckets.values()).find(
      (b) => b.key.dimensions.length === 1 && b.key.dimensions[0] === "overall"
    );
    const row = ts!.bucket.rows.get("date::2026-05-15");
    expect(row).toBeDefined();
    expect(row!.sum).toBe(150);
    expect(row!.count).toBe(2);
  });
});

describe("bucketToResponse", () => {
  it("count metric → response.rows reports the raw sum", () => {
    const buckets = _aggregate([p({ date: "2026-05-15", value: 100 })], TODAY);
    const overall = Array.from(buckets.values()).find(
      (b) => b.key.range === "last_7_days" && b.key.dimensions.length === 0
    )!;
    const { response } = _bucketToResponse(overall.key, overall.bucket, TODAY);
    const r = response as { rows: Array<{ value: number; dimensions: Record<string, string> }>; metric: string };
    expect(r.metric).toBe("ga4_sessions");
    expect(r.rows[0]!.value).toBe(100);
    expect(r.rows[0]!.dimensions).toEqual({});
  });

  it("percentage metric → response.rows averages", () => {
    const buckets = _aggregate(
      [
        p({ metric: "ga4_bounce_rate", metric_unit: "percentage", date: "2026-05-15", value: 40 }),
        p({ metric: "ga4_bounce_rate", metric_unit: "percentage", date: "2026-05-15", value: 60, id: "z" }),
      ],
      TODAY
    );
    const overall = Array.from(buckets.values()).find(
      (b) => b.key.metric === "ga4_bounce_rate" && b.key.range === "last_7_days" && b.key.dimensions.length === 0
    )!;
    const { response } = _bucketToResponse(overall.key, overall.bucket, TODAY);
    const r = response as { rows: Array<{ value: number }>; metric_unit: string };
    expect(r.metric_unit).toBe("percentage");
    expect(r.rows[0]!.value).toBe(50);
  });

  it("input shape mirrors the ga4_query tool's inputs (property_id, dimensions, date_range)", () => {
    const buckets = _aggregate(
      [p({ dimension: "device", dim_value: "mobile", value: 75 })],
      TODAY
    );
    const deviceBucket = Array.from(buckets.values()).find(
      (b) => b.key.dimensions[0] === "device" && b.key.range === "last_28_days"
    )!;
    const { input } = _bucketToResponse(deviceBucket.key, deviceBucket.bucket, TODAY);
    expect(input).toMatchObject({
      metric: "ga4_sessions",
      date_range: "last_28_days",
      dimensions: ["device"],
      property_id: "12345",
    });
  });
});
