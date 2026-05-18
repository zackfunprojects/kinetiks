/**
 * Tracking-gap cross-source detector.
 *
 * Three checks:
 *   - GSC clicks > 1.3 × GA4 sessions → GA4 not capturing search visitors
 *   - GA4 conversions > 1.5 × Stripe checkouts → GA4 conversion event miscount
 *   - Stripe checkouts > 1.3 × GA4 conversions → GA4 conversion event missing
 *
 * Required sources vary by check:
 *   - check 1: GSC + GA4
 *   - check 2: GA4 + Stripe
 *   - check 3: GA4 + Stripe
 *
 * Each check has its own dedup key so multiple gaps can co-exist as
 * separate insights.
 */

import type { OracleSignal, RiskSignal } from "../../insights/types";
import { isoWeek } from "../../insights/types";

export interface TrackingGapInput {
  gsc_clicks_28d?: number;
  ga4_sessions_28d?: number;
  ga4_conversions_28d?: number;
  stripe_checkouts_28d?: number;
  available_sources: string[];
  today?: Date;
}

export function detectTrackingGap(input: TrackingGapInput): OracleSignal[] {
  const week = isoWeek(input.today ?? new Date());
  const signals: OracleSignal[] = [];
  const hasGa4 = input.available_sources.includes("ga4");
  const hasGsc = input.available_sources.includes("gsc");
  const hasStripe = input.available_sources.includes("stripe");

  // Check 1: GSC vs GA4
  if (
    hasGsc &&
    hasGa4 &&
    input.gsc_clicks_28d != null &&
    input.ga4_sessions_28d != null &&
    input.ga4_sessions_28d > 0 &&
    input.gsc_clicks_28d / input.ga4_sessions_28d > 1.3
  ) {
    const ratio = input.gsc_clicks_28d / input.ga4_sessions_28d;
    const sig: RiskSignal = {
      type: "risk",
      severity: "notable",
      source_app: "cross",
      source_operator: "oracle.analyzer.tracking-gap",
      summary: `GSC reports ${input.gsc_clicks_28d} clicks but GA4 saw only ${input.ga4_sessions_28d} sessions over 28d (${ratio.toFixed(2)}× gap). GA4 is undercounting search traffic.`,
      evidence: {
        gsc_clicks_28d: input.gsc_clicks_28d,
        ga4_sessions_28d: input.ga4_sessions_28d,
        gap_ratio: round(ratio, 2),
        check: "gsc_vs_ga4",
      },
      suggested_action: {
        kind: "open_thread",
        label: "Verify GA4 site tag on landing pages",
      },
      dedup_key: `tracking-gap:gsc-vs-ga4:${week}`,
    };
    signals.push(sig);
  }

  // Check 2: GA4 conversions vs Stripe checkouts (over-count)
  if (
    hasGa4 &&
    hasStripe &&
    input.ga4_conversions_28d != null &&
    input.stripe_checkouts_28d != null &&
    input.stripe_checkouts_28d > 0 &&
    input.ga4_conversions_28d / input.stripe_checkouts_28d > 1.5
  ) {
    const ratio = input.ga4_conversions_28d / input.stripe_checkouts_28d;
    const sig: RiskSignal = {
      type: "risk",
      severity: "notable",
      source_app: "cross",
      source_operator: "oracle.analyzer.tracking-gap",
      summary: `GA4 logged ${input.ga4_conversions_28d} conversions but Stripe saw ${input.stripe_checkouts_28d} checkouts (${ratio.toFixed(2)}× over-count). GA4 conversion event is probably misconfigured.`,
      evidence: {
        ga4_conversions_28d: input.ga4_conversions_28d,
        stripe_checkouts_28d: input.stripe_checkouts_28d,
        gap_ratio: round(ratio, 2),
        check: "ga4_overcount_conversions",
      },
      suggested_action: {
        kind: "open_thread",
        label: "Review GA4 conversion event mapping",
      },
      dedup_key: `tracking-gap:ga4-overcount:${week}`,
    };
    signals.push(sig);
  }

  // Check 3: Stripe checkouts vs GA4 conversions (under-count)
  if (
    hasGa4 &&
    hasStripe &&
    input.ga4_conversions_28d != null &&
    input.stripe_checkouts_28d != null &&
    input.ga4_conversions_28d > 0 &&
    input.stripe_checkouts_28d / input.ga4_conversions_28d > 1.3
  ) {
    const ratio = input.stripe_checkouts_28d / input.ga4_conversions_28d;
    const sig: RiskSignal = {
      type: "risk",
      severity: "notable",
      source_app: "cross",
      source_operator: "oracle.analyzer.tracking-gap",
      summary: `Stripe saw ${input.stripe_checkouts_28d} checkouts but GA4 only logged ${input.ga4_conversions_28d} conversions (${ratio.toFixed(2)}× gap). GA4 is missing conversion events.`,
      evidence: {
        ga4_conversions_28d: input.ga4_conversions_28d,
        stripe_checkouts_28d: input.stripe_checkouts_28d,
        gap_ratio: round(ratio, 2),
        check: "ga4_undercount_conversions",
      },
      suggested_action: {
        kind: "open_thread",
        label: "Wire GA4 purchase event to checkout success",
      },
      dedup_key: `tracking-gap:ga4-undercount:${week}`,
    };
    signals.push(sig);
  }

  return signals;
}

function round(n: number, p: number): number {
  const f = Math.pow(10, p);
  return Math.round(n * f) / f;
}
