import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}));
vi.mock("@/lib/oracle/metric-schema", () => ({
  getMetricDefinition: vi.fn(),
}));
vi.mock("@/lib/oracle/cache-reader", () => ({
  loadAccountCacheRows: vi.fn(async () => []),
}));
vi.mock("@/lib/oracle/cross-source-inputs", () => ({
  readDailySeries: vi.fn(() => []),
}));

import {
  computeSeriesStats,
  MIN_BASELINE_POINTS,
  supabaseMetricCacheReader,
} from "../metric-stats";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMetricDefinition } from "@/lib/oracle/metric-schema";
import { loadAccountCacheRows } from "@/lib/oracle/cache-reader";
import { readDailySeries } from "@/lib/oracle/cross-source-inputs";

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

describe("supabaseMetricCacheReader.fetchMetricStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for an unregistered metric without touching the cache", async () => {
    vi.mocked(getMetricDefinition).mockReturnValue(undefined);
    const out = await supabaseMetricCacheReader.fetchMetricStats({
      account_id: "acc-1",
      metric: "not_a_metric",
    });
    expect(out).toBeNull();
    // Short-circuits before any DB work.
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(loadAccountCacheRows).not.toHaveBeenCalled();
  });

  it("returns null when the cached series is too short for a baseline", async () => {
    vi.mocked(getMetricDefinition).mockReturnValue({ source_app: "ga4" } as never);
    vi.mocked(readDailySeries).mockReturnValue(series([10, 11, 12]));
    const out = await supabaseMetricCacheReader.fetchMetricStats({
      account_id: "acc-1",
      metric: "ga4_sessions",
    });
    expect(out).toBeNull();
  });

  it("reads the metric scoped to its source app and returns z-score inputs", async () => {
    vi.mocked(getMetricDefinition).mockReturnValue({ source_app: "ga4" } as never);
    const rows = [{ marker: true }];
    vi.mocked(loadAccountCacheRows).mockResolvedValue(rows as never);
    vi.mocked(readDailySeries).mockReturnValue(series([...Array(9).fill(100), 200]));

    const out = await supabaseMetricCacheReader.fetchMetricStats({
      account_id: "acc-1",
      metric: "ga4_sessions",
    });

    expect(out).toEqual({ mean: 100, stddev: 0, latest: 200 });
    // The cache read is scoped to the metric's declared source app, and
    // the series is read for (rows, source_app, metric).
    expect(loadAccountCacheRows).toHaveBeenCalledWith(
      expect.anything(),
      "acc-1",
      ["ga4"],
    );
    expect(readDailySeries).toHaveBeenCalledWith(rows, "ga4", "ga4_sessions");
  });
});
