/**
 * MetricCacheReader implementation for the anomaly escalation trigger — E3.
 *
 * Replaces the v1 runtime-boot stub (which returned null, leaving the
 * anomaly trigger permanently inert — the audit's "a customer
 * approving an anomaly trigger has no anomaly protection"). Resolves a
 * registered metric key through the Oracle metric registry, reads the
 * account's cached daily series (the same `kinetiks_metric_cache`
 * buckets the Oracle detectors consume — no provider calls), and
 * returns the z-score inputs:
 *
 *   latest  = the most recent daily point
 *   mean    = mean of the PRIOR points (latest excluded so today's
 *             spike cannot pollute its own baseline)
 *   stddev  = population stddev of the same baseline
 *
 * Returns null when the metric key is unregistered, the series is
 * missing, or the baseline is too short to mean anything
 * (< MIN_BASELINE_POINTS). The evaluator treats a configured-reader
 * null as FIRED (fail closed): a grant whose customer approved
 * anomaly protection escalates rather than silently executing without
 * the protection.
 */

import "server-only";

import type { MetricCacheReader } from "@kinetiks/runtime";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMetricDefinition } from "@/lib/oracle/metric-schema";
import { loadAccountCacheRows } from "@/lib/oracle/cache-reader";
import { readDailySeries } from "@/lib/oracle/cross-source-inputs";

/** Fewer prior points than this is no baseline at all. */
export const MIN_BASELINE_POINTS = 7;

/** Pure stats core, unit-tested directly. */
export function computeSeriesStats(
  series: Array<{ date: string; value: number }>,
): { mean: number; stddev: number; latest: number } | null {
  if (series.length < MIN_BASELINE_POINTS + 1) return null;
  const latest = series[series.length - 1].value;
  const baseline = series.slice(0, -1).map((p) => p.value);
  const mean = baseline.reduce((s, v) => s + v, 0) / baseline.length;
  const variance =
    baseline.reduce((s, v) => s + (v - mean) * (v - mean), 0) / baseline.length;
  return { mean, stddev: Math.sqrt(variance), latest };
}

export const supabaseMetricCacheReader: MetricCacheReader = {
  async fetchMetricStats({ account_id, metric }) {
    const def = getMetricDefinition(metric);
    if (!def) return null;
    const admin = createAdminClient();
    const rows = await loadAccountCacheRows(admin, account_id, [def.source_app]);
    const series = readDailySeries(rows, def.source_app, metric);
    return computeSeriesStats(series);
  },
};
