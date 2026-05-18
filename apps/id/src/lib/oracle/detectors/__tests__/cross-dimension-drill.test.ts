import { describe, expect, it } from "vitest";

import { detectCrossDimensionDrill } from "../cross-dimension-drill";

const TODAY = new Date("2026-05-17T00:00:00Z");

describe("detectCrossDimensionDrill", () => {
  it("emits a risk when overall is flat but a high-share dim is down", () => {
    const signals = detectCrossDimensionDrill({
      source_app: "ga4",
      metric_key: "ga4_sessions",
      dimension: "device",
      overall: { value: 10000, previous: 10100 },     // -1%
      byDimension: [
        { dim_value: "mobile", value: 6000, previous: 8700 },   // -31%, 60% share
        { dim_value: "desktop", value: 3700, previous: 1100 },  // +236%, 37% share
        { dim_value: "tablet", value: 300, previous: 300 },     // flat, <5% share
      ],
      today: TODAY,
    });
    expect(signals).toHaveLength(2);  // mobile (risk) + desktop (opportunity)
    const mobile = signals.find((s) => (s.evidence.dim_value as string) === "mobile")!;
    expect(mobile.type).toBe("risk");
    expect(mobile.severity).toBe("urgent");
    expect(mobile.source_operator).toBe("oracle.analyzer.drill");
  });

  it("classifies an upward dimension as opportunity for higher_better metrics", () => {
    const signals = detectCrossDimensionDrill({
      source_app: "ga4",
      metric_key: "ga4_sessions",
      dimension: "device",
      overall: { value: 1000, previous: 1100 },
      byDimension: [{ dim_value: "mobile", value: 600, previous: 200 }],
      today: TODAY,
    });
    expect(signals[0]!.type).toBe("opportunity");
  });

  it("ignores dimensions below minShare", () => {
    const signals = detectCrossDimensionDrill({
      source_app: "ga4",
      metric_key: "ga4_sessions",
      dimension: "device",
      overall: { value: 10000, previous: 10000 },
      byDimension: [{ dim_value: "fridge", value: 100, previous: 10 }],   // 1% share
      today: TODAY,
    });
    expect(signals).toHaveLength(0);
  });

  it("suppresses signals where signs agree (everything moving the same way)", () => {
    const signals = detectCrossDimensionDrill({
      source_app: "ga4",
      metric_key: "ga4_sessions",
      dimension: "device",
      overall: { value: 12000, previous: 10000 },           // +20%
      byDimension: [{ dim_value: "mobile", value: 9000, previous: 7000 }],  // +29%, same direction
      today: TODAY,
    });
    expect(signals).toHaveLength(0);
  });

  it("emits dedup_key in the {detector}:{metric}:{dim}:{dim_value}:{iso_week} format", () => {
    const signals = detectCrossDimensionDrill({
      source_app: "ga4",
      metric_key: "ga4_sessions",
      dimension: "device",
      overall: { value: 10000, previous: 10000 },
      byDimension: [{ dim_value: "mobile", value: 4000, previous: 6000 }],
      today: TODAY,
    });
    expect(signals[0]!.dedup_key).toMatch(/^drill:ga4_sessions:device:mobile:\d{4}-W\d{2}$/);
  });

  it("returns empty array when overall has no baseline", () => {
    const signals = detectCrossDimensionDrill({
      source_app: "ga4",
      metric_key: "ga4_sessions",
      dimension: "device",
      overall: { value: 1000, previous: 0 },
      byDimension: [{ dim_value: "mobile", value: 500, previous: 100 }],
      today: TODAY,
    });
    expect(signals).toHaveLength(0);
  });
});
