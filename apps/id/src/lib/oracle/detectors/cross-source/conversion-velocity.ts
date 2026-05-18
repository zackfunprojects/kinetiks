/**
 * Conversion-velocity cross-source detector.
 *
 * Time from first GA4 session → HubSpot deal close, measured as median
 * days. Compare last 30d vs prior 30d. A 25% slowdown is a risk; a 25%
 * tightening is an opportunity.
 *
 * Required sources: HubSpot + GA4.
 */

import type { OpportunitySignal, OracleSignal, RiskSignal } from "../../insights/types";
import { isoWeek } from "../../insights/types";

export interface ConversionVelocityInput {
  /** Median days for deals closed in the last 30 days. Null if no closures. */
  current_median_days: number | null;
  /** Median days for deals closed in the 30 days before that. */
  prior_median_days: number | null;
  current_sample_size: number;
  prior_sample_size: number;
  available_sources: string[];
  today?: Date;
}

const MIN_SAMPLE = 5;

export function detectConversionVelocity(
  input: ConversionVelocityInput
): OracleSignal[] {
  if (!input.available_sources.includes("hubspot") || !input.available_sources.includes("ga4")) {
    return [];
  }
  if (
    input.current_median_days == null ||
    input.prior_median_days == null ||
    input.current_sample_size < MIN_SAMPLE ||
    input.prior_sample_size < MIN_SAMPLE
  ) {
    return [];
  }

  const delta = (input.current_median_days - input.prior_median_days) / input.prior_median_days;
  if (Math.abs(delta) < 0.25) return [];

  const week = isoWeek(input.today ?? new Date());

  if (delta > 0.25) {
    const sig: RiskSignal = {
      type: "risk",
      severity: Math.abs(delta) >= 0.5 ? "urgent" : "notable",
      source_app: "cross",
      source_operator: "oracle.analyzer.conversion-velocity",
      summary: `Median time-to-close slowed ${Math.round(delta * 100)}% (${Math.round(input.prior_median_days)}d → ${Math.round(input.current_median_days)}d).`,
      evidence: {
        current_median_days: round(input.current_median_days, 1),
        prior_median_days: round(input.prior_median_days, 1),
        delta_pct: round(delta * 100, 1),
        current_sample_size: input.current_sample_size,
        prior_sample_size: input.prior_sample_size,
      },
      suggested_action: {
        kind: "open_thread",
        label: "Triage sales pipeline stage holdups",
      },
      dedup_key: `conv-velocity-slow:${week}`,
    };
    return [sig];
  }

  const sig: OpportunitySignal = {
    type: "opportunity",
    severity: "notable",
    source_app: "cross",
    source_operator: "oracle.analyzer.conversion-velocity",
    summary: `Median time-to-close tightened ${Math.round(Math.abs(delta) * 100)}% (${Math.round(input.prior_median_days)}d → ${Math.round(input.current_median_days)}d). Something is working.`,
    evidence: {
      current_median_days: round(input.current_median_days, 1),
      prior_median_days: round(input.prior_median_days, 1),
      delta_pct: round(delta * 100, 1),
      current_sample_size: input.current_sample_size,
      prior_sample_size: input.prior_sample_size,
    },
    suggested_action: {
      kind: "open_thread",
      label: "Identify what's accelerating deals",
    },
    dedup_key: `conv-velocity-fast:${week}`,
  };
  return [sig];
}

function round(n: number, p: number): number {
  const f = Math.pow(10, p);
  return Math.round(n * f) / f;
}
