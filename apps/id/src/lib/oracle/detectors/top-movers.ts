/**
 * Top-mover detector.
 *
 * For each (metric, dimension) tuple, finds the dim_value with the
 * largest absolute delta vs prior period. Emits one signal per pair
 * when the mover has share >= 0.05 AND |delta| >= 0.30.
 *
 * Short-circuits against drill signals: if a drill signal already
 * covers the same (metric, dim, dim_value), top-mover is suppressed
 * in favor of the more specific drill.
 */

import type {
  OpportunitySignal,
  OracleSignal,
  RiskSignal,
  SignalSeverity,
} from "../insights/types";
import { isoWeek } from "../insights/types";
import { getMetricDefinition } from "../metric-schema";

export interface TopMoverInput {
  source_app: string;
  metric_key: string;
  dimension: string;
  overall: { value: number; previous: number };
  byDimension: Array<{ dim_value: string; value: number; previous: number }>;
  /** Dedup keys from drill signals so we suppress overlap. */
  drillDedupKeys?: Set<string>;
  today?: Date;
  minShare?: number;
  minDelta?: number;
}

const DEFAULT_MIN_SHARE = 0.05;
const DEFAULT_MIN_DELTA = 0.30;

export function detectTopMovers(input: TopMoverInput): OracleSignal[] {
  if (input.overall.value === 0) return [];
  const minShare = input.minShare ?? DEFAULT_MIN_SHARE;
  const minDelta = input.minDelta ?? DEFAULT_MIN_DELTA;
  const week = isoWeek(input.today ?? new Date());

  const metric = getMetricDefinition(input.metric_key);
  const higherBetter = !metric || metric.direction === "higher_better";

  let bestRow: { dim_value: string; share: number; delta: number } | null = null;
  for (const row of input.byDimension) {
    if (row.previous === 0) continue;
    const share = row.value / input.overall.value;
    if (share < minShare) continue;
    const delta = (row.value - row.previous) / row.previous;
    if (Math.abs(delta) < minDelta) continue;
    if (!bestRow || Math.abs(delta) > Math.abs(bestRow.delta)) {
      bestRow = { dim_value: row.dim_value, share, delta };
    }
  }

  if (!bestRow) return [];

  const dedup_key = `topmover:${input.metric_key}:${input.dimension}:${bestRow.dim_value}:${week}`;
  // Suppress when drill already covers
  if (input.drillDedupKeys?.has(`drill:${input.metric_key}:${input.dimension}:${bestRow.dim_value}:${week}`)) {
    return [];
  }

  const severity: SignalSeverity =
    Math.abs(bestRow.delta) >= 0.50 && bestRow.share >= 0.20
      ? "urgent"
      : Math.abs(bestRow.delta) >= 0.40 || bestRow.share >= 0.15
        ? "notable"
        : "info";

  const isWorsening = higherBetter ? bestRow.delta < 0 : bestRow.delta > 0;
  const arrow = bestRow.delta >= 0 ? "↑" : "↓";
  const summary = `${input.dimension}=${bestRow.dim_value} is the biggest mover on ${input.metric_key} (${arrow}${Math.round(Math.abs(bestRow.delta) * 100)}%, ${Math.round(bestRow.share * 100)}% share)`;

  const evidence = {
    metric_key: input.metric_key,
    dimension: input.dimension,
    dim_value: bestRow.dim_value,
    share: round(bestRow.share, 4),
    dim_delta_pct: round(bestRow.delta, 4),
    period: "last_28_days",
  };

  if (isWorsening) {
    const signal: RiskSignal = {
      type: "risk",
      severity,
      source_app: input.source_app,
      source_operator: "oracle.analyzer.top-movers",
      summary,
      evidence,
      suggested_action: {
        kind: "open_thread",
        label: `Triage ${input.dimension}=${bestRow.dim_value}`,
      },
      dedup_key,
    };
    return [signal];
  }

  const signal: OpportunitySignal = {
    type: "opportunity",
    severity,
    source_app: input.source_app,
    source_operator: "oracle.analyzer.top-movers",
    summary,
    evidence,
    suggested_action: {
      kind: "open_thread",
      label: `Amplify ${input.dimension}=${bestRow.dim_value}`,
    },
    dedup_key,
  };
  return [signal];
}

function round(n: number, places: number): number {
  const factor = Math.pow(10, places);
  return Math.round(n * factor) / factor;
}
