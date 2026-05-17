/**
 * Cross-dimension drill detector.
 *
 * For a metric whose overall value is stable (or trending one way),
 * flags dimension values moving *against* that overall trend with
 * enough share + delta to matter.
 *
 * Example: ga4_sessions is flat overall (-2%), but device=mobile is down
 * 31% with a 62% session share. That's a real signal hidden under the
 * overall scalar.
 *
 * Algorithm:
 *   1. Compute overall delta = (overall.value - overall.previous) / overall.previous
 *   2. For each dim_value with share >= minShare:
 *        dimDelta = (value - previous) / previous
 *        if |dimDelta - overallDelta| >= minDelta AND signs differ → flag
 *   3. Severity:
 *        urgent  if share >= 0.30 AND |dimDelta| >= 0.30
 *        notable if share >= 0.15 OR  |dimDelta| >= 0.30
 *        else info
 *   4. Type: 'risk' if direction worsens vs metric.direction; else 'opportunity'
 *
 * Source-agnostic — works for any metric+dimension combination.
 */

import type {
  OracleSignal,
  OpportunitySignal,
  RiskSignal,
  SignalSeverity,
} from "../insights/types";
import { isoWeek } from "../insights/types";
import { getMetricDefinition } from "../metric-schema";

export interface DimensionRow {
  dim_value: string;
  value: number;
  previous: number;
}

export interface CrossDimensionDrillInput {
  source_app: string;
  metric_key: string;
  dimension: string;
  overall: { value: number; previous: number };
  byDimension: DimensionRow[];
  minShare?: number;
  minDelta?: number;
  /** Defaults to new Date(); injected for tests. */
  today?: Date;
}

const DEFAULT_MIN_SHARE = 0.05;
const DEFAULT_MIN_DELTA = 0.20;

export function detectCrossDimensionDrill(
  input: CrossDimensionDrillInput
): OracleSignal[] {
  if (input.overall.previous === 0 || input.overall.value === 0) return [];
  const minShare = input.minShare ?? DEFAULT_MIN_SHARE;
  const minDelta = input.minDelta ?? DEFAULT_MIN_DELTA;
  const overallDelta = (input.overall.value - input.overall.previous) / input.overall.previous;

  const metric = getMetricDefinition(input.metric_key);
  const higherBetter = !metric || metric.direction === "higher_better";

  const week = isoWeek(input.today ?? new Date());

  const signals: OracleSignal[] = [];

  for (const row of input.byDimension) {
    if (row.previous === 0) continue;
    const share = row.value / input.overall.value;
    if (share < minShare) continue;

    const dimDelta = (row.value - row.previous) / row.previous;
    const divergence = Math.abs(dimDelta - overallDelta);
    if (divergence < minDelta) continue;
    // Note: we used to require the signs to differ ("against the trend"),
    // but that misses the more common case of a dim amplifying overall
    // weakness (overall -1%, mobile -31%). The divergence check above
    // already filters out the not-interesting case where the dim moves
    // with overall at roughly the same magnitude.

    const severity: SignalSeverity =
      share >= 0.30 && Math.abs(dimDelta) >= 0.30
        ? "urgent"
        : share >= 0.15 || Math.abs(dimDelta) >= 0.30
          ? "notable"
          : "info";

    const isWorsening = higherBetter ? dimDelta < 0 : dimDelta > 0;
    const arrow = dimDelta >= 0 ? "↑" : "↓";
    const summary = `${input.dimension}=${row.dim_value} ${arrow}${Math.round(Math.abs(dimDelta) * 100)}% on ${input.metric_key} (${Math.round(share * 100)}% share) while overall is ${overallDelta >= 0 ? "+" : ""}${Math.round(overallDelta * 100)}%`;

    const dedup_key = `drill:${input.metric_key}:${input.dimension}:${row.dim_value}:${week}`;

    if (isWorsening) {
      const signal: RiskSignal = {
        type: "risk",
        severity,
        source_app: input.source_app,
        source_operator: "oracle.analyzer.drill",
        summary,
        evidence: {
          metric_key: input.metric_key,
          dimension: input.dimension,
          dim_value: row.dim_value,
          share: round(share, 4),
          dim_delta_pct: round(dimDelta, 4),
          overall_delta_pct: round(overallDelta, 4),
          period: "last_28_days",
        },
        suggested_action: {
          kind: "open_thread",
          label: `Investigate ${input.dimension}=${row.dim_value} drop`,
        },
        dedup_key,
      };
      signals.push(signal);
    } else {
      const signal: OpportunitySignal = {
        type: "opportunity",
        severity,
        source_app: input.source_app,
        source_operator: "oracle.analyzer.drill",
        summary,
        evidence: {
          metric_key: input.metric_key,
          dimension: input.dimension,
          dim_value: row.dim_value,
          share: round(share, 4),
          dim_delta_pct: round(dimDelta, 4),
          overall_delta_pct: round(overallDelta, 4),
          period: "last_28_days",
        },
        suggested_action: {
          kind: "open_thread",
          label: `Lean into ${input.dimension}=${row.dim_value}`,
        },
        dedup_key,
      };
      signals.push(signal);
    }
  }

  return signals;
}

function round(n: number, places: number): number {
  const factor = Math.pow(10, places);
  return Math.round(n * factor) / factor;
}
