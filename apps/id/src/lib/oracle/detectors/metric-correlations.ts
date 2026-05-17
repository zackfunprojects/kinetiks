/**
 * Metric-correlation detector.
 *
 * Pairwise Pearson across daily series of the same source's metrics
 * over a 28-day window. Emits when:
 *   - n >= 14 (two weeks of daily points)
 *   - |r| >= 0.55
 *   - The correlation is surprising:
 *       same-direction metrics + negative r       → opportunity
 *       opposite-direction metrics + positive r   → risk
 *     same-direction + positive r is not interesting and is suppressed.
 *
 * Source-agnostic. GA4 alone gives 3 pairs (sessions/users/bouncerate);
 * when D3 lands Stripe + GSC, this scales without code changes.
 */

import type {
  OpportunitySignal,
  OracleSignal,
  RiskSignal,
  SignalSeverity,
} from "../insights/types";
import { isoWeek } from "../insights/types";
import { getMetricDefinition } from "../metric-schema";

export interface MetricSeries {
  metric_key: string;
  daily: Array<{ date: string; value: number }>;
}

export interface MetricCorrelationsInput {
  source_app: string;
  series: MetricSeries[];
  minSamples?: number;
  minR?: number;
  today?: Date;
}

const DEFAULT_MIN_SAMPLES = 14;
const DEFAULT_MIN_R = 0.55;

export function detectMetricCorrelations(
  input: MetricCorrelationsInput
): OracleSignal[] {
  const minSamples = input.minSamples ?? DEFAULT_MIN_SAMPLES;
  const minR = input.minR ?? DEFAULT_MIN_R;
  const today = input.today ?? new Date();
  const week = isoWeek(today);

  const signals: OracleSignal[] = [];

  for (let i = 0; i < input.series.length; i++) {
    for (let j = i + 1; j < input.series.length; j++) {
      const a = input.series[i]!;
      const b = input.series[j]!;

      const paired = pairByDate(a.daily, b.daily);
      if (paired.length < minSamples) continue;

      const r = pearson(paired.map((p) => p.aValue), paired.map((p) => p.bValue));
      if (!Number.isFinite(r) || Math.abs(r) < minR) continue;

      const dirA = getMetricDefinition(a.metric_key)?.direction ?? "higher_better";
      const dirB = getMetricDefinition(b.metric_key)?.direction ?? "higher_better";
      const sameDirection = dirA === dirB;

      // Is this "surprising"?
      const isOpportunity = sameDirection && r < 0;
      const isRisk = !sameDirection && r > 0;
      if (!isOpportunity && !isRisk) continue;

      const severity: SignalSeverity = Math.abs(r) >= 0.75 ? "notable" : "info";
      const sortedPair = [a.metric_key, b.metric_key].sort();
      const dedup_key = `corr:${sortedPair.join("+")}:${week}`;

      const rRounded = Math.round(r * 100) / 100;
      const arrow = r > 0 ? "↑↑" : "↑↓";
      const summary = `${a.metric_key} and ${b.metric_key} move ${arrow} together (r=${rRounded}, n=${paired.length})`;

      const evidence = {
        metric_a: a.metric_key,
        metric_b: b.metric_key,
        r: rRounded,
        n: paired.length,
        direction_a: dirA,
        direction_b: dirB,
      };

      if (isRisk) {
        const signal: RiskSignal = {
          type: "risk",
          severity,
          source_app: input.source_app,
          source_operator: "oracle.analyzer.correlation",
          summary,
          evidence,
          suggested_action: {
            kind: "open_thread",
            label: `Investigate ${a.metric_key} vs ${b.metric_key} correlation`,
          },
          dedup_key,
        };
        signals.push(signal);
      } else {
        const signal: OpportunitySignal = {
          type: "opportunity",
          severity,
          source_app: input.source_app,
          source_operator: "oracle.analyzer.correlation",
          summary,
          evidence,
          suggested_action: {
            kind: "open_thread",
            label: `Explore ${a.metric_key} + ${b.metric_key} alignment`,
          },
          dedup_key,
        };
        signals.push(signal);
      }
    }
  }

  return signals;
}

// ─── Helpers ────────────────────────────────────────────────

interface PairedPoint {
  date: string;
  aValue: number;
  bValue: number;
}

function pairByDate(
  a: Array<{ date: string; value: number }>,
  b: Array<{ date: string; value: number }>
): PairedPoint[] {
  const byDateA = new Map<string, number>();
  for (const p of a) byDateA.set(p.date, p.value);

  const out: PairedPoint[] = [];
  for (const p of b) {
    const aVal = byDateA.get(p.date);
    if (aVal !== undefined && Number.isFinite(aVal) && Number.isFinite(p.value)) {
      out.push({ date: p.date, aValue: aVal, bValue: p.value });
    }
  }
  return out;
}

export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0 || n !== ys.length) return NaN;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }
  const num = n * sumXY - sumX * sumY;
  const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (denom === 0) return 0;
  return num / denom;
}
