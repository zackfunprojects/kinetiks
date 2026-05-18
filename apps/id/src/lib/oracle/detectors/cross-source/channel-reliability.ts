/**
 * Channel-reliability cross-source detector.
 *
 * For HubSpot deals with a recorded deal_source, compare against the
 * deal's GA4 first-touch attribution. Discrepancies indicate either
 * stale CRM hygiene or a real tracking gap.
 *
 * Two emissions:
 *   - info risk    : > 30% of deals disagree with GA4 attribution
 *   - notable risk : a specific claimed channel has zero GA4 sessions
 *                    for the contact (tracking blackout)
 *
 * Required sources: HubSpot + GA4.
 */

import type { OracleSignal, RiskSignal } from "../../insights/types";
import { isoWeek } from "../../insights/types";

export interface DealAttribution {
  deal_id: string;
  claimed_source: string | null;
  ga4_first_touch_source: string | null;
}

export interface ChannelReliabilityInput {
  deals_last_90d: DealAttribution[];
  available_sources: string[];
  today?: Date;
}

export function detectChannelReliability(
  input: ChannelReliabilityInput
): OracleSignal[] {
  if (!input.available_sources.includes("hubspot") || !input.available_sources.includes("ga4")) {
    return [];
  }
  const week = isoWeek(input.today ?? new Date());
  const signals: OracleSignal[] = [];

  const labeled = input.deals_last_90d.filter((d) => d.claimed_source && d.claimed_source.length > 0);
  if (labeled.length < 10) return [];

  // Disagreement rate
  let disagree = 0;
  const channelBlackout = new Map<string, number>();
  for (const d of labeled) {
    if (!d.ga4_first_touch_source) {
      channelBlackout.set(d.claimed_source!, (channelBlackout.get(d.claimed_source!) ?? 0) + 1);
      disagree += 1;
      continue;
    }
    if (d.claimed_source!.toLowerCase() !== d.ga4_first_touch_source.toLowerCase()) {
      disagree += 1;
    }
  }

  const disagreeRate = disagree / labeled.length;
  if (disagreeRate > 0.3) {
    signals.push({
      type: "risk",
      severity: "info",
      source_app: "cross",
      source_operator: "oracle.analyzer.channel-reliability",
      summary: `${Math.round(disagreeRate * 100)}% of HubSpot deals (90d) disagree with GA4 first-touch attribution.`,
      evidence: {
        disagree_rate: Math.round(disagreeRate * 10000) / 100,
        labeled_deal_count: labeled.length,
        period: "last_90_days",
      },
      suggested_action: {
        kind: "open_thread",
        label: "Audit CRM source labeling vs GA4",
      },
      dedup_key: `channel-reliability-drift:90d:${week}`,
    });
  }

  // Per-channel blackouts (>= 30% of claimed deals lack GA4 attribution)
  for (const [channel, count] of channelBlackout.entries()) {
    const channelTotal = labeled.filter((d) => d.claimed_source === channel).length;
    if (channelTotal < 5) continue;
    const blackoutRate = count / channelTotal;
    if (blackoutRate < 0.3) continue;
    const sig: RiskSignal = {
      type: "risk",
      severity: "notable",
      source_app: "cross",
      source_operator: "oracle.analyzer.channel-reliability",
      summary: `${Math.round(blackoutRate * 100)}% of HubSpot deals tagged "${channel}" (90d) have NO GA4 first-touch session. Tracking is probably broken on that channel.`,
      evidence: {
        channel,
        blackout_rate: Math.round(blackoutRate * 10000) / 100,
        deals_total: channelTotal,
        deals_without_ga4: count,
        period: "last_90_days",
      },
      suggested_action: {
        kind: "open_thread",
        label: `Verify ${channel} UTM tracking`,
      },
      dedup_key: `channel-reliability-blackout:${channel}:${week}`,
    };
    signals.push(sig);
  }

  return signals;
}
