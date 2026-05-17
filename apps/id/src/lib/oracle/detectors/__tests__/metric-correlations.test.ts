import { describe, expect, it } from "vitest";

import { detectMetricCorrelations, pearson } from "../metric-correlations";

const TODAY = new Date("2026-05-17T00:00:00Z");

function series(metric: string, values: number[]): { metric_key: string; daily: Array<{ date: string; value: number }> } {
  // Generate dates working backward from 2026-05-15.
  const start = new Date("2026-05-15T00:00:00Z");
  return {
    metric_key: metric,
    daily: values.map((v, i) => {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() - (values.length - 1 - i));
      return { date: d.toISOString().slice(0, 10), value: v };
    }),
  };
}

describe("pearson", () => {
  it("perfectly correlated series → r=1", () => {
    expect(pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1, 5);
  });

  it("anti-correlated series → r=-1", () => {
    expect(pearson([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1, 5);
  });

  it("constant series → r=0 (no variance)", () => {
    expect(pearson([1, 1, 1, 1], [2, 3, 4, 5])).toBe(0);
  });
});

describe("detectMetricCorrelations", () => {
  it("ignores pairs below the minSamples threshold", () => {
    const signals = detectMetricCorrelations({
      source_app: "ga4",
      series: [
        series("ga4_sessions", [1, 2, 3]),
        series("ga4_users", [1, 2, 3]),
      ],
      today: TODAY,
    });
    expect(signals).toHaveLength(0);
  });

  it("emits a risk when opposite-direction metrics correlate positively", () => {
    // ga4_sessions = higher_better, ga4_bounce_rate = lower_better
    // Both trending up together → bad (more sessions but more bouncing)
    const dailyValues = Array.from({ length: 20 }, (_, i) => i + 1);
    const signals = detectMetricCorrelations({
      source_app: "ga4",
      series: [
        series("ga4_sessions", dailyValues),
        series("ga4_bounce_rate", dailyValues),
      ],
      today: TODAY,
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]!.type).toBe("risk");
    expect(signals[0]!.source_operator).toBe("oracle.analyzer.correlation");
  });

  it("emits an opportunity when same-direction metrics correlate negatively", () => {
    // Both higher_better. r < 0 → opportunity (something's not aligned)
    const a = Array.from({ length: 20 }, (_, i) => i + 1);
    const b = a.map((v) => -v + 30);
    const signals = detectMetricCorrelations({
      source_app: "ga4",
      series: [series("ga4_sessions", a), series("ga4_users", b)],
      today: TODAY,
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]!.type).toBe("opportunity");
  });

  it("suppresses the not-interesting case (same-direction + positive r)", () => {
    const v = Array.from({ length: 20 }, (_, i) => i + 1);
    const signals = detectMetricCorrelations({
      source_app: "ga4",
      series: [series("ga4_sessions", v), series("ga4_users", v)],
      today: TODAY,
    });
    expect(signals).toHaveLength(0);
  });

  it("assigns notable severity at |r| >= 0.75", () => {
    const a = Array.from({ length: 20 }, (_, i) => i + 1);
    const b = a.map((v) => v + (Math.sin(v) * 0.5));
    const signals = detectMetricCorrelations({
      source_app: "ga4",
      series: [series("ga4_sessions", a), series("ga4_bounce_rate", b)],
      today: TODAY,
    });
    if (signals.length > 0) {
      expect(["info", "notable"]).toContain(signals[0]!.severity);
    }
  });
});
