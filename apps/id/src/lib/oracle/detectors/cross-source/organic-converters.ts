/**
 * Organic-converters cross-source detector.
 *
 * Joins GSC top-ranked pages × GA4 sessions × Stripe revenue per page.
 * Two emission shapes:
 *   - opportunity: high SEO rank + high traffic + LOW conversion → fix the funnel
 *   - opportunity: rising rank + rising traffic + rising revenue → double down
 *
 * Required sources: GSC + GA4. Stripe optional but enriches the signal.
 */

import type { OpportunitySignal, OracleSignal } from "../../insights/types";
import { isoWeek } from "../../insights/types";

export interface OrganicPageStat {
  page: string;
  gsc_avg_position: number;
  ga4_sessions_28d: number;
  stripe_revenue_attributed_28d: number;
  /** Optional 28d-over-28d trends. */
  position_delta_28d?: number;
  sessions_delta_28d?: number;
  revenue_delta_28d?: number;
}

export interface OrganicConvertersInput {
  pages: OrganicPageStat[];
  available_sources: string[];
  today?: Date;
}

const MIN_SESSIONS = 100;            // floor to avoid noise
const STRONG_RANK_CUTOFF = 5;        // position 1-5

export function detectOrganicConverters(
  input: OrganicConvertersInput
): OracleSignal[] {
  if (!input.available_sources.includes("gsc") || !input.available_sources.includes("ga4")) {
    return [];
  }
  const hasStripe = input.available_sources.includes("stripe");
  const week = isoWeek(input.today ?? new Date());
  const signals: OracleSignal[] = [];

  for (const p of input.pages) {
    if (p.ga4_sessions_28d < MIN_SESSIONS) continue;

    // Pattern A: top-ranked + high traffic + low conversion (only with Stripe)
    if (
      hasStripe &&
      p.gsc_avg_position <= STRONG_RANK_CUTOFF &&
      p.stripe_revenue_attributed_28d < p.ga4_sessions_28d * 0.5    // <$0.50 RPS
    ) {
      const dedup_key = `organic-conv-leak:${normalizePagePath(p.page)}:${week}`;
      const sig: OpportunitySignal = {
        type: "opportunity",
        severity: "notable",
        source_app: "cross",
        source_operator: "oracle.analyzer.organic-converters",
        summary: `${p.page} ranks ~${p.gsc_avg_position.toFixed(1)} and pulls ${p.ga4_sessions_28d} sessions/28d but converts poorly. Fix the on-page CTA path.`,
        evidence: {
          page: p.page,
          gsc_avg_position: round(p.gsc_avg_position, 2),
          ga4_sessions_28d: p.ga4_sessions_28d,
          stripe_revenue_attributed_28d: round(p.stripe_revenue_attributed_28d, 2),
          revenue_per_session: round(p.stripe_revenue_attributed_28d / p.ga4_sessions_28d, 4),
          pattern: "rank_high_convert_low",
        },
        suggested_action: {
          kind: "open_thread",
          label: `Audit on-page CTAs for ${p.page}`,
        },
        dedup_key,
      };
      signals.push(sig);
    }

    // Pattern B: rising rank + rising sessions + rising revenue
    if (
      p.position_delta_28d != null &&
      p.position_delta_28d < 0 &&                  // lower position = better
      p.sessions_delta_28d != null &&
      p.sessions_delta_28d > 0.1 &&
      (!hasStripe || (p.revenue_delta_28d ?? 0) > 0.1)
    ) {
      const dedup_key = `organic-conv-rising:${normalizePagePath(p.page)}:${week}`;
      const sig: OpportunitySignal = {
        type: "opportunity",
        severity: "notable",
        source_app: "cross",
        source_operator: "oracle.analyzer.organic-converters",
        summary: `${p.page}: SEO trending up, traffic +${Math.round((p.sessions_delta_28d ?? 0) * 100)}%${hasStripe ? `, revenue +${Math.round((p.revenue_delta_28d ?? 0) * 100)}%` : ""}. Double down.`,
        evidence: {
          page: p.page,
          position_delta_28d: round(p.position_delta_28d ?? 0, 2),
          sessions_delta_28d: round(p.sessions_delta_28d ?? 0, 4),
          revenue_delta_28d: round(p.revenue_delta_28d ?? 0, 4),
          pattern: "rising_aligned",
        },
        suggested_action: {
          kind: "open_thread",
          label: `Plan amplification for ${p.page}`,
        },
        dedup_key,
      };
      signals.push(sig);
    }
  }

  return signals;
}

function round(n: number, p: number): number {
  const f = Math.pow(10, p);
  return Math.round(n * f) / f;
}

function normalizePagePath(s: string): string {
  // Keep the path stable across runs; strip protocol/host if present
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://x/${s.replace(/^\//, "")}`);
    return u.pathname;
  } catch {
    return s;
  }
}
