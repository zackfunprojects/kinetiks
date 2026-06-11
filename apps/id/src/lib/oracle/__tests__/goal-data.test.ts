import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability/sentry", () => ({
  captureException: vi.fn(async () => undefined),
  captureMessage: vi.fn(async () => undefined),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CachedMetricRow } from "../cache-reader";
import { computeGoalValue, metricAggregation, updateGoalData } from "../goal-data";
import { METRIC_REGISTRY } from "../metric-schema";

function row(
  source: string,
  input: Record<string, unknown>,
  rows: Array<{ dimensions: Record<string, string>; value: number }>,
): CachedMetricRow {
  return { source, input, response: { rows }, refreshed_at: "2026-06-11T00:00:00Z" };
}

const scalar = (value: number) => [{ dimensions: {}, value }];

describe("metricAggregation - exhaustive over the metric schema", () => {
  it("classifies every registered metric (no silent defaults)", () => {
    const missing = METRIC_REGISTRY.map((m) => m.key).filter(
      (key) => metricAggregation(key) === null,
    );
    expect(missing).toEqual([]);
  });

  it("returns null for unregistered metrics", () => {
    expect(metricAggregation("made_up_metric")).toBeNull();
  });
});

describe("computeGoalValue", () => {
  const today = new Date("2026-06-11T12:00:00Z");

  it("sums the daily series inside the goal period for window metrics", () => {
    const rows = [
      row(
        "ga4",
        { metric: "ga4_sessions", date_range: "last_90_days", dimensions: ["date"] },
        [
          { dimensions: { date: "2026-05-30" }, value: 100 }, // before period
          { dimensions: { date: "2026-06-01" }, value: 40 },
          { dimensions: { date: "2026-06-02" }, value: 50 },
          { dimensions: { date: "2026-06-10" }, value: 60 },
        ],
      ),
      row("ga4", { metric: "ga4_sessions", date_range: "last_28_days" }, scalar(999)),
    ];
    const value = computeGoalValue(
      { metric_key: "ga4_sessions", period_start: "2026-06-01T00:00:00Z" },
      rows,
      today,
    );
    expect(value).toBe(150); // in-period sum, not the 28d scalar
  });

  it("returns 0 when the daily series has no in-period points (just-started goal)", () => {
    const rows = [
      row(
        "ga4",
        { metric: "ga4_sessions", date_range: "last_90_days", dimensions: ["date"] },
        [
          { dimensions: { date: "2026-06-01" }, value: 40 },
          { dimensions: { date: "2026-06-05" }, value: 50 },
        ],
      ),
      // The 28d scalar would say 999 - the bug this guards against:
      // a goal starting today must NOT inherit the trailing window.
      row("ga4", { metric: "ga4_sessions", date_range: "last_28_days" }, scalar(999)),
    ];
    const value = computeGoalValue(
      { metric_key: "ga4_sessions", period_start: "2026-06-11T00:00:00Z" },
      rows,
      today,
    );
    expect(value).toBe(0);
  });

  it("falls back to the 28d window scalar when no daily series exists", () => {
    const rows = [
      row("meta_ads", { metric: "meta_spend", date_range: "last_28_days" }, scalar(740)),
    ];
    expect(
      computeGoalValue(
        { metric_key: "meta_spend", period_start: "2026-06-01T00:00:00Z" },
        rows,
        today,
      ),
    ).toBe(740);
  });

  it("reads level metrics as the latest value (stripe `period` quirk included)", () => {
    const rows = [
      row("stripe", { metric: "stripe_mrr", period: "last_28_days" }, scalar(8400)),
    ];
    expect(
      computeGoalValue({ metric_key: "stripe_mrr", period_start: null }, rows, today),
    ).toBe(8400);
  });

  it("reads hubspot aggregator snapshots via the `snapshot` period", () => {
    const rows = [
      row("hubspot", { metric: "hubspot_deals_open", period: "snapshot" }, scalar(12)),
    ];
    expect(
      computeGoalValue({ metric_key: "hubspot_deals_open", period_start: null }, rows, today),
    ).toBe(12);
  });

  it("returns null for goals without a metric, unknown metrics, or empty cache", () => {
    expect(computeGoalValue({ metric_key: null, period_start: null }, [], today)).toBeNull();
    expect(
      computeGoalValue({ metric_key: "made_up_metric", period_start: null }, [], today),
    ).toBeNull();
    expect(
      computeGoalValue({ metric_key: "ga4_sessions", period_start: null }, [], today),
    ).toBeNull();
  });
});

describe("updateGoalData", () => {
  const today = new Date("2026-06-11T12:00:00Z");

  function makeAdminStub(opts: {
    goals: Array<Record<string, unknown>>;
    latestSnapshot?: { value: number; snapshot_at: string } | null;
  }) {
    const goalUpdates: Array<Record<string, unknown>> = [];
    const snapshotInserts: Array<Record<string, unknown>> = [];

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "kinetiks_goals") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  not: vi.fn(async () => ({ data: opts.goals, error: null })),
                })),
              })),
            })),
            update: vi.fn((payload: Record<string, unknown>) => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => {
                  goalUpdates.push(payload);
                  return { error: null };
                }),
              })),
            })),
          };
        }
        if (table === "kinetiks_goal_snapshots") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: opts.latestSnapshot ?? null,
                      error: null,
                    })),
                  })),
                })),
              })),
            })),
            insert: vi.fn(async (payload: Record<string, unknown>) => {
              snapshotInserts.push(payload);
              return { error: null };
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    } as unknown as SupabaseClient;

    return { admin, goalUpdates, snapshotInserts };
  }

  const cacheRows = [
    row("stripe", { metric: "stripe_mrr", period: "last_28_days" }, scalar(8400)),
  ];

  it("updates current_value and writes the first snapshot", async () => {
    const { admin, goalUpdates, snapshotInserts } = makeAdminStub({
      goals: [
        { id: "g1", metric_key: "stripe_mrr", period_start: null, period_end: null, current_value: 0 },
      ],
    });

    const result = await updateGoalData(admin, "acc-1", cacheRows, today);

    expect(result).toEqual({ goals_seen: 1, goals_updated: 1, snapshots_written: 1 });
    expect(goalUpdates[0].current_value).toBe(8400);
    expect(snapshotInserts[0]).toMatchObject({
      goal_id: "g1",
      account_id: "acc-1",
      value: 8400,
    });
  });

  it("skips the goal update and snapshot when the value is unchanged and fresh", async () => {
    const { admin, goalUpdates, snapshotInserts } = makeAdminStub({
      goals: [
        { id: "g1", metric_key: "stripe_mrr", period_start: null, period_end: null, current_value: 8400 },
      ],
      latestSnapshot: { value: 8400, snapshot_at: "2026-06-11T10:00:00Z" }, // 2h old
    });

    const result = await updateGoalData(admin, "acc-1", cacheRows, today);

    expect(result).toEqual({ goals_seen: 1, goals_updated: 0, snapshots_written: 0 });
    expect(goalUpdates).toHaveLength(0);
    expect(snapshotInserts).toHaveLength(0);
  });

  it("writes a heartbeat snapshot when the latest point is stale", async () => {
    const { admin, snapshotInserts } = makeAdminStub({
      goals: [
        { id: "g1", metric_key: "stripe_mrr", period_start: null, period_end: null, current_value: 8400 },
      ],
      latestSnapshot: { value: 8400, snapshot_at: "2026-06-11T01:00:00Z" }, // 11h old
    });

    const result = await updateGoalData(admin, "acc-1", cacheRows, today);

    expect(result.snapshots_written).toBe(1);
    expect(snapshotInserts).toHaveLength(1);
  });

  it("leaves goals untouched when the metric has no cache data", async () => {
    const { admin, goalUpdates, snapshotInserts } = makeAdminStub({
      goals: [
        { id: "g1", metric_key: "gsc_clicks", period_start: null, period_end: null, current_value: 5 },
      ],
    });

    const result = await updateGoalData(admin, "acc-1", cacheRows, today);

    expect(result).toEqual({ goals_seen: 1, goals_updated: 0, snapshots_written: 0 });
    expect(goalUpdates).toHaveLength(0);
    expect(snapshotInserts).toHaveLength(0);
  });
});
