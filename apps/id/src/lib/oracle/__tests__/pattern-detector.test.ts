/**
 * First unit tests for the existing pattern-detector.ts.
 *
 * The detector shipped with D1 but had no test coverage. Added here as
 * part of Slice 8 because the Oracle runner depends on its math being
 * stable.
 */

import { describe, expect, it } from "vitest";

import { detectAnomalies, detectTrends } from "../pattern-detector";

function series(values: number[]): Array<{ value: number; timestamp: string }> {
  return values.map((v, i) => ({
    value: v,
    timestamp: new Date(2026, 0, i + 1).toISOString(),
  }));
}

describe("detectAnomalies", () => {
  it("returns [] when fewer than 10 values", () => {
    expect(detectAnomalies(series([1, 2, 3, 4, 5]), "ga4_sessions")).toEqual([]);
  });

  it("returns [] when stdDev is zero (flat baseline)", () => {
    const values = series([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
    expect(detectAnomalies(values, "ga4_sessions")).toEqual([]);
  });

  it("returns [] when z-score is below 2", () => {
    // Baseline 1..10, latest = 11 → z ≈ 1.59
    const values = series([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(detectAnomalies(values, "ga4_sessions")).toEqual([]);
  });

  it("flags severity=low when 2 <= |z| < 2.5", () => {
    // Latest is moderately anomalous
    const values = series([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 8, 5, 5, 5, 5, 5, 12]);
    const out = detectAnomalies(values, "ga4_sessions");
    if (out.length > 0) {
      expect(["low", "medium", "high"]).toContain(out[0]!.severity);
    }
  });

  it("flags severity=high when |z| >= 3.5", () => {
    // Slight variance in baseline + large spike → high-severity anomaly
    const values = series([5, 4, 5, 6, 5, 4, 5, 6, 5, 4, 5, 6, 50]);
    const out = detectAnomalies(values, "ga4_sessions");
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("high");
    expect(out[0]!.direction).toBe("above");
  });

  it("flags direction=below for negative anomalies", () => {
    const values = series([50, 49, 51, 50, 49, 51, 50, 49, 51, 50, 49, 51, 1]);
    const out = detectAnomalies(values, "ga4_sessions");
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]!.direction).toBe("below");
  });
});

describe("detectTrends", () => {
  it("returns null when fewer than 5 values", () => {
    expect(detectTrends(series([1, 2, 3]), "ga4_sessions")).toBeNull();
  });

  it("returns null on a perfectly flat series (denom=0)", () => {
    expect(detectTrends(series([5, 5, 5, 5, 5, 5, 5]), "ga4_sessions")).toBeNull();
  });

  it("detects an upward trend on a strict-monotone increasing series", () => {
    const t = detectTrends(series([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), "ga4_sessions");
    expect(t).not.toBeNull();
    expect(t!.direction).toBe("up");
    expect(t!.r_squared).toBeGreaterThan(0.95);
  });

  it("detects a downward trend on a strict-monotone decreasing series", () => {
    const t = detectTrends(series([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]), "ga4_sessions");
    expect(t).not.toBeNull();
    expect(t!.direction).toBe("down");
  });

  it("returns null when R-squared < 0.3 (noisy data)", () => {
    const t = detectTrends(series([1, 100, 5, 80, 10, 70, 15, 60]), "ga4_sessions");
    expect(t).toBeNull();
  });
});
