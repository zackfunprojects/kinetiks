import { describe, expect, it } from "vitest";

import { detectTopMovers } from "../top-movers";

const TODAY = new Date("2026-05-17T00:00:00Z");

describe("detectTopMovers", () => {
  it("picks the dim with the largest absolute delta", () => {
    const signals = detectTopMovers({
      source_app: "ga4",
      metric_key: "ga4_sessions",
      dimension: "source",
      overall: { value: 10000, previous: 10000 },
      byDimension: [
        { dim_value: "organic", value: 6000, previous: 5000 },     // +20% — below minDelta
        { dim_value: "direct", value: 2500, previous: 4000 },      // -37%
        { dim_value: "referral", value: 1500, previous: 1000 },    // +50%
      ],
      today: TODAY,
    });
    expect(signals).toHaveLength(1);
    expect((signals[0]!.evidence.dim_value as string)).toBe("referral");
    expect(signals[0]!.type).toBe("opportunity");
  });

  it("classifies a worsening top-mover on a higher_better metric as risk", () => {
    const signals = detectTopMovers({
      source_app: "ga4",
      metric_key: "ga4_sessions",
      dimension: "device",
      overall: { value: 10000, previous: 10000 },
      byDimension: [{ dim_value: "mobile", value: 4000, previous: 6000 }],   // -33%
      today: TODAY,
    });
    expect(signals[0]!.type).toBe("risk");
  });

  it("suppresses when a drill signal already covers the same key", () => {
    const drillKeys = new Set<string>(["drill:ga4_sessions:device:mobile:2026-W20"]);
    const signals = detectTopMovers({
      source_app: "ga4",
      metric_key: "ga4_sessions",
      dimension: "device",
      overall: { value: 10000, previous: 10000 },
      byDimension: [{ dim_value: "mobile", value: 4000, previous: 6000 }],
      drillDedupKeys: drillKeys,
      today: TODAY,
    });
    expect(signals).toHaveLength(0);
  });

  it("emits nothing when no dim exceeds minDelta", () => {
    const signals = detectTopMovers({
      source_app: "ga4",
      metric_key: "ga4_sessions",
      dimension: "source",
      overall: { value: 10000, previous: 10000 },
      byDimension: [
        { dim_value: "organic", value: 6000, previous: 5800 },     // +3%
      ],
      today: TODAY,
    });
    expect(signals).toHaveLength(0);
  });
});
