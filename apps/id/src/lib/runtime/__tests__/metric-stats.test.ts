import { describe, expect, it } from "vitest";

import { computeSeriesStats, MIN_BASELINE_POINTS } from "../metric-stats";

function series(values: number[]): Array<{ date: string; value: number }> {
  return values.map((value, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, "0")}`,
    value,
  }));
}

describe("computeSeriesStats", () => {
  it("returns null when the baseline is too short to mean anything", () => {
    expect(computeSeriesStats([])).toBeNull();
    expect(computeSeriesStats(series(Array(MIN_BASELINE_POINTS).fill(10)))).toBeNull();
  });

  it("computes mean/stddev over the baseline EXCLUDING the latest point", () => {
    // Baseline of 9 points at 100, latest spikes to 200: the spike must
    // not pollute its own baseline.
    const stats = computeSeriesStats(series([...Array(9).fill(100), 200]));
    expect(stats).not.toBeNull();
    expect(stats!.latest).toBe(200);
    expect(stats!.mean).toBe(100);
    expect(stats!.stddev).toBe(0);
  });

  it("computes a population stddev on a varied baseline", () => {
    const stats = computeSeriesStats(
      series([90, 110, 90, 110, 90, 110, 90, 110, 150]),
    );
    expect(stats).not.toBeNull();
    expect(stats!.latest).toBe(150);
    expect(stats!.mean).toBe(100);
    expect(stats!.stddev).toBe(10);
  });
});
