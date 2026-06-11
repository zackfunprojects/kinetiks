import { describe, expect, it } from "vitest";
import type { CachedMetricRow } from "../cache-reader";
import {
  buildChannelReliabilityInput,
  buildConversionVelocityInput,
  buildCorrelationInputs,
  buildDimensionalInputs,
  buildOrganicConvertersInput,
  buildRoasByChannelInput,
  buildSpendEfficiencyInput,
  buildTrackingGapInput,
  readDailySeries,
  readDimensionRows,
  readScalar,
} from "../cross-source-inputs";

function row(
  source: string,
  input: Record<string, unknown>,
  rows: Array<{ dimensions: Record<string, string>; value: number }>,
): CachedMetricRow {
  return {
    source,
    input,
    response: { rows },
    refreshed_at: "2026-06-11T00:00:00Z",
  };
}

const scalar = (value: number) => [{ dimensions: {}, value }];

describe("cache row readers", () => {
  it("readScalar matches metric + date_range with no dimensions", () => {
    const rows = [
      row("ga4", { metric: "ga4_sessions", date_range: "last_28_days" }, scalar(1200)),
      row("ga4", { metric: "ga4_sessions", date_range: "last_7_days" }, scalar(300)),
    ];
    expect(readScalar(rows, "ga4", "ga4_sessions", "last_28_days")).toBe(1200);
    expect(readScalar(rows, "ga4", "ga4_sessions", "last_7_days")).toBe(300);
    expect(readScalar(rows, "ga4", "ga4_sessions", "last_90_days")).toBeNull();
  });

  it("readScalar matches stripe's `period` field (handler quirk)", () => {
    const rows = [
      row("stripe", { metric: "stripe_mrr", period: "last_28_days" }, scalar(8400)),
    ];
    expect(readScalar(rows, "stripe", "stripe_mrr", "last_28_days")).toBe(8400);
  });

  it("readScalar ignores dimension buckets of the same metric+range", () => {
    const rows = [
      row(
        "ga4",
        { metric: "ga4_sessions", date_range: "last_28_days", dimensions: ["device"] },
        [{ dimensions: { device: "mobile" }, value: 700 }],
      ),
      row("ga4", { metric: "ga4_sessions", date_range: "last_28_days" }, scalar(1200)),
    ];
    expect(readScalar(rows, "ga4", "ga4_sessions", "last_28_days")).toBe(1200);
  });

  it("readDailySeries returns date-sorted points from the ['date'] bucket", () => {
    const rows = [
      row(
        "ga4",
        { metric: "ga4_sessions", date_range: "last_90_days", dimensions: ["date"] },
        [
          { dimensions: { date: "2026-06-02" }, value: 40 },
          { dimensions: { date: "2026-06-01" }, value: 35 },
        ],
      ),
    ];
    expect(readDailySeries(rows, "ga4", "ga4_sessions")).toEqual([
      { date: "2026-06-01", value: 35 },
      { date: "2026-06-02", value: 40 },
    ]);
  });

  it("readDimensionRows extracts {dim_value, value} pairs", () => {
    const rows = [
      row(
        "meta_ads",
        { metric: "meta_spend", date_range: "last_7_days", dimensions: ["campaign"] },
        [
          { dimensions: { campaign: "c1" }, value: 120 },
          { dimensions: { campaign: "c2" }, value: 60 },
        ],
      ),
    ];
    expect(
      readDimensionRows(rows, "meta_ads", "meta_spend", "last_7_days", "campaign"),
    ).toEqual([
      { dim_value: "c1", value: 120 },
      { dim_value: "c2", value: 60 },
    ]);
  });

  it("tolerates malformed response rows", () => {
    const rows: CachedMetricRow[] = [
      {
        source: "ga4",
        input: { metric: "ga4_sessions", date_range: "last_28_days" },
        response: { rows: [null, "junk", { value: "NaN" }, { dimensions: {}, value: 9 }] },
        refreshed_at: "2026-06-11T00:00:00Z",
      },
    ];
    expect(readScalar(rows, "ga4", "ga4_sessions", "last_28_days")).toBe(9);
  });
});

describe("buildRoasByChannelInput", () => {
  it("assembles per-channel spend + platform conversion value", () => {
    const rows = [
      row("meta_ads", { metric: "meta_spend", date_range: "last_28_days" }, scalar(900)),
      row("meta_ads", { metric: "meta_conversion_value", date_range: "last_28_days" }, scalar(2700)),
      row("google_ads", { metric: "gads_spend", date_range: "last_28_days" }, scalar(600)),
      row("google_ads", { metric: "gads_conversion_value", date_range: "last_28_days" }, scalar(300)),
    ];
    const input = buildRoasByChannelInput(rows, ["meta_ads", "google_ads", "stripe"]);
    expect(input).not.toBeNull();
    expect(input!.channels).toEqual([
      { channel: "meta", spend_28d: 900, revenue_28d: 2700 },
      { channel: "google", spend_28d: 600, revenue_28d: 300 },
    ]);
    expect(input!.available_sources).toEqual(["meta_ads", "google_ads", "stripe"]);
  });

  it("drops a channel missing either side and nulls out with no channels", () => {
    const rows = [
      row("meta_ads", { metric: "meta_spend", date_range: "last_28_days" }, scalar(900)),
      // no meta_conversion_value
    ];
    expect(buildRoasByChannelInput(rows, ["meta_ads", "stripe"])).toBeNull();
  });
});

describe("buildTrackingGapInput", () => {
  it("feeds check 1 (GSC vs GA4) and leaves the unavailable checks undefined", () => {
    const rows = [
      row("gsc", { metric: "gsc_clicks", date_range: "last_28_days" }, scalar(1300)),
      row("ga4", { metric: "ga4_sessions", date_range: "last_28_days" }, scalar(800)),
    ];
    const input = buildTrackingGapInput(rows, ["gsc", "ga4"]);
    expect(input).toEqual({
      gsc_clicks_28d: 1300,
      ga4_sessions_28d: 800,
      available_sources: ["gsc", "ga4"],
    });
    expect(input!.ga4_conversions_28d).toBeUndefined();
    expect(input!.stripe_checkouts_28d).toBeUndefined();
  });

  it("returns null when neither side exists", () => {
    expect(buildTrackingGapInput([], ["ga4"])).toBeNull();
  });
});

describe("data-gated builders stay off until their data exists", () => {
  it("spend-efficiency, organic-converters, channel-reliability, conversion-velocity return null", () => {
    expect(buildSpendEfficiencyInput()).toBeNull();
    expect(buildOrganicConvertersInput()).toBeNull();
    expect(buildChannelReliabilityInput()).toBeNull();
    expect(buildConversionVelocityInput()).toBeNull();
  });
});

describe("buildDimensionalInputs", () => {
  const campaignRows = (
    source: string,
    metric: string,
    sevenDay: Array<[string, number]>,
    twentyEightDay: Array<[string, number]>,
    overall7: number,
    overall28: number,
  ) => [
    row(source, { metric, date_range: "last_7_days" }, scalar(overall7)),
    row(source, { metric, date_range: "last_28_days" }, scalar(overall28)),
    row(
      source,
      { metric, date_range: "last_7_days", dimensions: ["campaign"] },
      sevenDay.map(([campaign, value]) => ({ dimensions: { campaign }, value })),
    ),
    row(
      source,
      { metric, date_range: "last_28_days", dimensions: ["campaign"] },
      twentyEightDay.map(([campaign, value]) => ({ dimensions: { campaign }, value })),
    ),
  ];

  it("builds current=7d vs previous=(28d-7d)/3 for paid campaign metrics", () => {
    const rows = campaignRows(
      "meta_ads",
      "meta_spend",
      [["c1", 70], ["c2", 30]],
      [["c1", 280], ["c2", 240]],
      100,
      520,
    );
    const inputs = buildDimensionalInputs(rows);
    expect(inputs).toHaveLength(1);
    const d = inputs[0];
    expect(d.source_app).toBe("meta_ads");
    expect(d.metric_key).toBe("meta_spend");
    expect(d.dimension).toBe("campaign");
    // overall: current 100, previous (520-100)/3 = 140
    expect(d.overall).toEqual({ value: 100, previous: 140 });
    // c1: current 70, previous (280-70)/3 = 70 — flat
    // c2: current 30, previous (240-30)/3 = 70 — big drop
    expect(d.byDimension).toEqual([
      { dim_value: "c1", value: 70, previous: 70 },
      { dim_value: "c2", value: 30, previous: 70 },
    ]);
  });

  it("skips a metric whose 7d or 28d campaign bucket is missing", () => {
    const rows = [
      row("meta_ads", { metric: "meta_spend", date_range: "last_7_days" }, scalar(100)),
      row("meta_ads", { metric: "meta_spend", date_range: "last_28_days" }, scalar(520)),
      // 7d campaign bucket only — no 28d campaign bucket
      row(
        "meta_ads",
        { metric: "meta_spend", date_range: "last_7_days", dimensions: ["campaign"] },
        [{ dimensions: { campaign: "c1" }, value: 70 }],
      ),
    ];
    expect(buildDimensionalInputs(rows)).toEqual([]);
  });

  it("clamps previous to 0 when the 7d window exceeds the 28d total", () => {
    const rows = campaignRows(
      "google_ads",
      "gads_clicks",
      [["c1", 60]],
      [["c1", 50]], // inconsistent windows (cache refresh skew)
      60,
      50,
    );
    const inputs = buildDimensionalInputs(rows);
    expect(inputs[0].byDimension[0].previous).toBe(0);
    expect(inputs[0].overall.previous).toBe(0);
  });
});

describe("buildCorrelationInputs", () => {
  const daily = (n: number, fn: (i: number) => number) =>
    Array.from({ length: n }, (_, i) => ({
      dimensions: { date: `2026-05-${String(i + 1).padStart(2, "0")}` },
      value: fn(i),
    }));

  it("builds one input per connected source with ≥2 series of ≥14 points", () => {
    const rows = [
      row("ga4", { metric: "ga4_sessions", date_range: "last_90_days", dimensions: ["date"] }, daily(20, (i) => 100 + i)),
      row("ga4", { metric: "ga4_users", date_range: "last_90_days", dimensions: ["date"] }, daily(20, (i) => 80 + i)),
      row("ga4", { metric: "ga4_bounce_rate", date_range: "last_90_days", dimensions: ["date"] }, daily(5, () => 50)),
      row("gsc", { metric: "gsc_clicks", date_range: "last_90_days", dimensions: ["date"] }, daily(20, (i) => 10 + i)),
    ];
    const inputs = buildCorrelationInputs(rows, ["ga4", "gsc"]);
    // ga4 qualifies (sessions+users ≥14 pts; bounce_rate dropped at 5 pts).
    // gsc has only one qualifying series → no pairs → dropped.
    expect(inputs).toHaveLength(1);
    expect(inputs[0].source_app).toBe("ga4");
    expect(inputs[0].series.map((s) => s.metric_key)).toEqual([
      "ga4_sessions",
      "ga4_users",
    ]);
  });

  it("respects the connected-sources gate", () => {
    const rows = [
      row("ga4", { metric: "ga4_sessions", date_range: "last_90_days", dimensions: ["date"] }, daily(20, (i) => i)),
      row("ga4", { metric: "ga4_users", date_range: "last_90_days", dimensions: ["date"] }, daily(20, (i) => i)),
    ];
    expect(buildCorrelationInputs(rows, ["gsc"])).toEqual([]);
  });
});
