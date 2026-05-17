/**
 * Smoke tests for the six cross-source detectors.
 *
 * Each detector gets a happy-path and a "skipped due to missing source"
 * test. Per-detector edge cases tested where the logic is non-trivial.
 */

import { describe, expect, it } from "vitest";

import {
  detectChannelReliability,
  detectConversionVelocity,
  detectOrganicConverters,
  detectRoasByChannel,
  detectSpendEfficiency,
  detectTrackingGap,
} from "..";

const TODAY = new Date("2026-05-17T00:00:00Z");

// ─── ROAS by channel ──────────────────────────────────────

describe("detectRoasByChannel", () => {
  it("skips when paid+stripe sources are missing", () => {
    const out = detectRoasByChannel({
      channels: [{ channel: "meta", spend_28d: 1000, revenue_28d: 500 }],
      available_sources: ["ga4"],
      today: TODAY,
    });
    expect(out).toHaveLength(0);
  });

  it("emits urgent risk when ROAS < 0.8", () => {
    const out = detectRoasByChannel({
      channels: [{ channel: "meta", spend_28d: 5000, revenue_28d: 3000 }],
      available_sources: ["meta_ads", "stripe"],
      today: TODAY,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe("risk");
    expect(out[0]!.severity).toBe("urgent");
  });

  it("emits opportunity when ROAS > 4.0", () => {
    const out = detectRoasByChannel({
      channels: [{ channel: "google", spend_28d: 1000, revenue_28d: 5000 }],
      available_sources: ["google_ads", "stripe"],
      today: TODAY,
    });
    expect(out[0]!.type).toBe("opportunity");
  });

  it("skips channels below minSpend", () => {
    const out = detectRoasByChannel({
      channels: [{ channel: "meta", spend_28d: 100, revenue_28d: 0 }],
      available_sources: ["meta_ads", "stripe"],
      today: TODAY,
    });
    expect(out).toHaveLength(0);
  });
});

// ─── Organic converters ───────────────────────────────────

describe("detectOrganicConverters", () => {
  it("skips when GSC or GA4 missing", () => {
    const out = detectOrganicConverters({
      pages: [],
      available_sources: ["gsc"],
      today: TODAY,
    });
    expect(out).toHaveLength(0);
  });

  it("flags high-rank + high-traffic + low-revenue as opportunity", () => {
    const out = detectOrganicConverters({
      pages: [
        {
          page: "/pricing",
          gsc_avg_position: 2.5,
          ga4_sessions_28d: 5000,
          stripe_revenue_attributed_28d: 100,
        },
      ],
      available_sources: ["gsc", "ga4", "stripe"],
      today: TODAY,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.evidence.pattern).toBe("rank_high_convert_low");
  });

  it("flags rising-aligned pattern when GSC + traffic + revenue all up", () => {
    const out = detectOrganicConverters({
      pages: [
        {
          page: "/blog/x",
          gsc_avg_position: 8,
          ga4_sessions_28d: 500,
          stripe_revenue_attributed_28d: 1000,
          position_delta_28d: -2,   // rank improving
          sessions_delta_28d: 0.3,
          revenue_delta_28d: 0.5,
        },
      ],
      available_sources: ["gsc", "ga4", "stripe"],
      today: TODAY,
    });
    expect(out.find((s) => s.evidence.pattern === "rising_aligned")).toBeDefined();
  });
});

// ─── Channel reliability ──────────────────────────────────

describe("detectChannelReliability", () => {
  it("skips when HubSpot or GA4 missing", () => {
    const out = detectChannelReliability({
      deals_last_90d: [],
      available_sources: ["ga4"],
      today: TODAY,
    });
    expect(out).toHaveLength(0);
  });

  it("flags drift when >30% of deals disagree", () => {
    const deals = Array.from({ length: 20 }, (_, i) => ({
      deal_id: `d${i}`,
      claimed_source: "google",
      ga4_first_touch_source: i < 10 ? "facebook" : "google",  // 50% disagree
    }));
    const out = detectChannelReliability({
      deals_last_90d: deals,
      available_sources: ["hubspot", "ga4"],
      today: TODAY,
    });
    expect(out.find((s) => (s.dedup_key as string).includes("drift"))).toBeDefined();
  });

  it("flags per-channel blackouts", () => {
    const deals = Array.from({ length: 10 }, () => ({
      deal_id: "d",
      claimed_source: "linkedin",
      ga4_first_touch_source: null,
    }));
    const out = detectChannelReliability({
      deals_last_90d: deals,
      available_sources: ["hubspot", "ga4"],
      today: TODAY,
    });
    expect(out.find((s) => s.evidence.channel === "linkedin")).toBeDefined();
  });
});

// ─── Conversion velocity ──────────────────────────────────

describe("detectConversionVelocity", () => {
  it("emits risk when velocity slows >25%", () => {
    const out = detectConversionVelocity({
      current_median_days: 50,
      prior_median_days: 30,
      current_sample_size: 10,
      prior_sample_size: 12,
      available_sources: ["hubspot", "ga4"],
      today: TODAY,
    });
    expect(out[0]!.type).toBe("risk");
  });

  it("emits opportunity when velocity tightens >25%", () => {
    const out = detectConversionVelocity({
      current_median_days: 20,
      prior_median_days: 30,
      current_sample_size: 10,
      prior_sample_size: 12,
      available_sources: ["hubspot", "ga4"],
      today: TODAY,
    });
    expect(out[0]!.type).toBe("opportunity");
  });

  it("skips when sample sizes are tiny", () => {
    const out = detectConversionVelocity({
      current_median_days: 50,
      prior_median_days: 30,
      current_sample_size: 1,
      prior_sample_size: 1,
      available_sources: ["hubspot", "ga4"],
      today: TODAY,
    });
    expect(out).toHaveLength(0);
  });
});

// ─── Spend efficiency ─────────────────────────────────────

describe("detectSpendEfficiency", () => {
  it("emits urgent risk when spend ↑ and MRR flat/down", () => {
    const out = detectSpendEfficiency({
      paid_spend_weekly: [
        { week: "2026-W12", value: 1000 },
        { week: "2026-W13", value: 1100 },
        { week: "2026-W14", value: 1200 },
        { week: "2026-W15", value: 1300 },
        { week: "2026-W16", value: 1400 },
        { week: "2026-W17", value: 1500 },
      ],
      stripe_mrr_weekly: [
        { week: "2026-W12", value: 10000 },
        { week: "2026-W13", value: 10000 },
        { week: "2026-W14", value: 10000 },
        { week: "2026-W15", value: 10000 },
        { week: "2026-W16", value: 10000 },
        { week: "2026-W17", value: 10000 },
      ],
      available_sources: ["meta_ads", "stripe"],
      today: TODAY,
    });
    expect(out[0]!.severity).toBe("urgent");
  });

  it("emits opportunity when spend flat + MRR up", () => {
    const out = detectSpendEfficiency({
      paid_spend_weekly: [
        { week: "2026-W12", value: 1000 },
        { week: "2026-W13", value: 1000 },
        { week: "2026-W14", value: 1000 },
        { week: "2026-W15", value: 1000 },
        { week: "2026-W16", value: 1000 },
        { week: "2026-W17", value: 1000 },
      ],
      stripe_mrr_weekly: [
        { week: "2026-W12", value: 10000 },
        { week: "2026-W13", value: 11000 },
        { week: "2026-W14", value: 12100 },
        { week: "2026-W15", value: 13310 },
        { week: "2026-W16", value: 14641 },
        { week: "2026-W17", value: 16105 },
      ],
      available_sources: ["meta_ads", "stripe"],
      today: TODAY,
    });
    expect(out[0]!.type).toBe("opportunity");
  });
});

// ─── Tracking gap ─────────────────────────────────────────

describe("detectTrackingGap", () => {
  it("emits GSC-vs-GA4 risk when GSC clicks >> GA4 sessions", () => {
    const out = detectTrackingGap({
      gsc_clicks_28d: 5000,
      ga4_sessions_28d: 2500,
      available_sources: ["gsc", "ga4"],
      today: TODAY,
    });
    expect(out.find((s) => s.evidence.check === "gsc_vs_ga4")).toBeDefined();
  });

  it("emits GA4-overcount risk when GA4 conversions >> Stripe checkouts", () => {
    const out = detectTrackingGap({
      ga4_conversions_28d: 500,
      stripe_checkouts_28d: 200,
      available_sources: ["ga4", "stripe"],
      today: TODAY,
    });
    expect(out.find((s) => s.evidence.check === "ga4_overcount_conversions")).toBeDefined();
  });

  it("emits GA4-undercount risk when Stripe checkouts >> GA4 conversions", () => {
    const out = detectTrackingGap({
      ga4_conversions_28d: 100,
      stripe_checkouts_28d: 200,
      available_sources: ["ga4", "stripe"],
      today: TODAY,
    });
    expect(out.find((s) => s.evidence.check === "ga4_undercount_conversions")).toBeDefined();
  });

  it("skips checks whose required sources are missing", () => {
    const out = detectTrackingGap({
      gsc_clicks_28d: 5000,
      ga4_sessions_28d: 2500,
      available_sources: ["gsc"],
      today: TODAY,
    });
    expect(out).toHaveLength(0);
  });
});
