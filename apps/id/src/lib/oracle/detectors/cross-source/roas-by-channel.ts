/**
 * ROAS-by-channel cross-source detector.
 *
 * ROAS = Stripe revenue attributed to a channel / paid ad spend on that channel
 * over the last 28 days.
 *
 * Required sources: Meta Ads OR Google Ads (for spend) + Stripe (for revenue).
 * Attribution: Stripe metadata.utm_source → channel; fallback paths handled
 * by the runner before feeding the detector.
 *
 * Emits:
 *   - urgent risk     if ROAS < 0.8 on a channel with spend ≥ $500/28d
 *   - notable risk    if ROAS < 1.5 on a channel with spend ≥ $500/28d
 *   - notable oppty   if ROAS > 4.0 on a channel with spend ≥ $500/28d
 */

import type { OpportunitySignal, OracleSignal, RiskSignal } from "../../insights/types";
import { isoWeek } from "../../insights/types";

export interface ChannelSpendRevenue {
  channel: string;             // 'meta' | 'google' | 'direct' | 'organic' | 'referral' | 'email'
  spend_28d: number;
  revenue_28d: number;
}

export interface RoasByChannelInput {
  channels: ChannelSpendRevenue[];
  /** Connected source list for data-quality skip. */
  available_sources: string[];
  today?: Date;
  minSpend?: number;
}

const DEFAULT_MIN_SPEND = 500;

export function detectRoasByChannel(input: RoasByChannelInput): OracleSignal[] {
  // Require at least one paid-ads source + stripe
  const hasPaid =
    input.available_sources.includes("meta_ads") ||
    input.available_sources.includes("google_ads");
  const hasStripe = input.available_sources.includes("stripe");
  if (!hasPaid || !hasStripe) return [];

  const week = isoWeek(input.today ?? new Date());
  const minSpend = input.minSpend ?? DEFAULT_MIN_SPEND;
  const signals: OracleSignal[] = [];

  for (const ch of input.channels) {
    if (ch.spend_28d < minSpend) continue;
    const roas = ch.revenue_28d / ch.spend_28d;

    const dedup_key = `roas-channel:${ch.channel}:${week}`;

    if (roas < 0.8) {
      const sig: RiskSignal = {
        type: "risk",
        severity: "urgent",
        source_app: "cross",
        source_operator: "oracle.analyzer.roas-channel",
        summary: `${ch.channel} channel ROAS is ${roas.toFixed(2)}x ($${ch.spend_28d.toFixed(0)} spend, $${ch.revenue_28d.toFixed(0)} revenue 28d). Spend is outpacing return.`,
        evidence: {
          channel: ch.channel,
          spend_28d: Math.round(ch.spend_28d),
          revenue_28d: Math.round(ch.revenue_28d),
          roas: Math.round(roas * 100) / 100,
          period: "last_28_days",
        },
        suggested_action: {
          kind: "open_thread",
          label: `Pause or rework ${ch.channel} spend`,
        },
        dedup_key,
      };
      signals.push(sig);
    } else if (roas < 1.5) {
      const sig: RiskSignal = {
        type: "risk",
        severity: "notable",
        source_app: "cross",
        source_operator: "oracle.analyzer.roas-channel",
        summary: `${ch.channel} ROAS is ${roas.toFixed(2)}x — below the 1.5× breakeven heuristic.`,
        evidence: {
          channel: ch.channel,
          spend_28d: Math.round(ch.spend_28d),
          revenue_28d: Math.round(ch.revenue_28d),
          roas: Math.round(roas * 100) / 100,
          period: "last_28_days",
        },
        suggested_action: {
          kind: "open_thread",
          label: `Review ${ch.channel} creative + audiences`,
        },
        dedup_key,
      };
      signals.push(sig);
    } else if (roas > 4.0) {
      const sig: OpportunitySignal = {
        type: "opportunity",
        severity: "notable",
        source_app: "cross",
        source_operator: "oracle.analyzer.roas-channel",
        summary: `${ch.channel} is converting at ${roas.toFixed(1)}× ROAS. Scope to scale spend.`,
        evidence: {
          channel: ch.channel,
          spend_28d: Math.round(ch.spend_28d),
          revenue_28d: Math.round(ch.revenue_28d),
          roas: Math.round(roas * 100) / 100,
          period: "last_28_days",
        },
        suggested_action: {
          kind: "open_thread",
          label: `Scale ${ch.channel} spend`,
        },
        dedup_key,
      };
      signals.push(sig);
    }
  }

  return signals;
}
