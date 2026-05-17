/**
 * Spend-efficiency cross-source detector.
 *
 * Compare paid ad spend trend vs Stripe MRR trend over the last 8 weeks
 * (linear regression slope ratios). Flags:
 *   - urgent risk: spend trending up while MRR is flat or down
 *   - opportunity: spend trending flat while MRR is up (efficiency win)
 *
 * Required: (Meta Ads OR Google Ads) + Stripe.
 */

import type { OpportunitySignal, OracleSignal, RiskSignal } from "../../insights/types";
import { isoWeek } from "../../insights/types";

export interface WeeklyPoint {
  week: string;       // e.g. '2026-W18'
  value: number;
}

export interface SpendEfficiencyInput {
  paid_spend_weekly: WeeklyPoint[];    // sum of meta + gads per week
  stripe_mrr_weekly: WeeklyPoint[];    // last snapshot in each week
  available_sources: string[];
  today?: Date;
}

const MIN_WEEKS = 6;

export function detectSpendEfficiency(
  input: SpendEfficiencyInput
): OracleSignal[] {
  const hasPaid =
    input.available_sources.includes("meta_ads") ||
    input.available_sources.includes("google_ads");
  const hasStripe = input.available_sources.includes("stripe");
  if (!hasPaid || !hasStripe) return [];

  if (
    input.paid_spend_weekly.length < MIN_WEEKS ||
    input.stripe_mrr_weekly.length < MIN_WEEKS
  ) {
    return [];
  }

  const spendSlope = relativeSlope(input.paid_spend_weekly);
  const mrrSlope = relativeSlope(input.stripe_mrr_weekly);

  const week = isoWeek(input.today ?? new Date());

  // Spend up + MRR flat/down
  if (spendSlope > 0.05 && mrrSlope < 0.02) {
    const sig: RiskSignal = {
      type: "risk",
      severity: "urgent",
      source_app: "cross",
      source_operator: "oracle.analyzer.spend-efficiency",
      summary: `Paid spend is trending up (~${Math.round(spendSlope * 100)}%/week) but MRR is ${mrrSlope < 0 ? "down" : "flat"}. Spend-to-revenue gap is widening.`,
      evidence: {
        spend_slope_pct_per_week: round(spendSlope * 100, 1),
        mrr_slope_pct_per_week: round(mrrSlope * 100, 1),
        weeks: input.paid_spend_weekly.length,
        period: "last_8_weeks",
      },
      suggested_action: {
        kind: "open_thread",
        label: "Audit paid campaign efficiency",
      },
      dedup_key: `spend-efficiency-risk:${week}`,
    };
    return [sig];
  }

  // Spend flat + MRR up
  if (spendSlope < 0.02 && mrrSlope > 0.05) {
    const sig: OpportunitySignal = {
      type: "opportunity",
      severity: "notable",
      source_app: "cross",
      source_operator: "oracle.analyzer.spend-efficiency",
      summary: `MRR is up ~${Math.round(mrrSlope * 100)}%/week with flat paid spend. Marketing efficiency is improving.`,
      evidence: {
        spend_slope_pct_per_week: round(spendSlope * 100, 1),
        mrr_slope_pct_per_week: round(mrrSlope * 100, 1),
        weeks: input.stripe_mrr_weekly.length,
        period: "last_8_weeks",
      },
      suggested_action: {
        kind: "open_thread",
        label: "Identify which non-paid channels are driving growth",
      },
      dedup_key: `spend-efficiency-win:${week}`,
    };
    return [sig];
  }

  return [];
}

/**
 * Compute the average week-over-week percentage change. Returns the
 * relative slope as a fraction (0.05 = 5%/week).
 */
function relativeSlope(points: WeeklyPoint[]): number {
  if (points.length < 2) return 0;
  let pctChanges = 0;
  let count = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!.value;
    const cur = points[i]!.value;
    if (prev > 0) {
      pctChanges += (cur - prev) / prev;
      count += 1;
    }
  }
  return count > 0 ? pctChanges / count : 0;
}

function round(n: number, p: number): number {
  const f = Math.pow(10, p);
  return Math.round(n * f) / f;
}
