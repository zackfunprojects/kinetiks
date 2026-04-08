/**
 * Track and BillingTier definitions per CLAUDE.md.
 *
 * Tracks control DeskOf's discovery aperture and weekly budget.
 * Each billing tier has a maximum allowed track level.
 */

export type TrackLevel = "minimal" | "standard" | "hero";
export type BillingTier = "free" | "standard" | "hero";

export interface WeeklyBudget {
  professional: number;
  personal: number;
  total: number;
}

export interface Track {
  level: TrackLevel;
  weekly_budget: WeeklyBudget;
  /** 0-1, fraction of scored opportunities Scout will surface */
  discovery_aperture: number;
}

export const TRACK_CONFIGS: Record<TrackLevel, Track> = {
  minimal: {
    level: "minimal",
    weekly_budget: { professional: 2, personal: 1, total: 3 },
    discovery_aperture: 0.15,
  },
  standard: {
    level: "standard",
    weekly_budget: { professional: 5, personal: 2, total: 7 },
    discovery_aperture: 0.4,
  },
  hero: {
    level: "hero",
    weekly_budget: { professional: 11, personal: 4, total: 15 },
    discovery_aperture: 0.75,
  },
};

export const TIER_MAX_TRACK: Record<BillingTier, TrackLevel> = {
  free: "minimal",
  standard: "standard",
  hero: "hero",
};

/**
 * Per-tier quotas for features that have a quantitative cap rather
 * than a binary yes/no gate. Single source of truth — used by Mirror
 * cold start, the tier-config matrix, and any future billing-meter UI.
 *
 * Quality Addendum #10.4 quotas:
 *   Free      → 0 content URL submissions
 *   Standard  → 10
 *   Hero      → unlimited
 */
export const TIER_CONTENT_URL_LIMITS: Record<BillingTier, number> = {
  free: 0,
  standard: 10,
  hero: Number.POSITIVE_INFINITY,
};

/**
 * Returns true if the given track level is permitted for the billing tier.
 * Used by track-selector enforcement and the tier-gate middleware.
 */
export function canSelectTrack(
  tier: BillingTier,
  track: TrackLevel
): boolean {
  const maxAllowed = TIER_MAX_TRACK[tier];
  const order: TrackLevel[] = ["minimal", "standard", "hero"];
  return order.indexOf(track) <= order.indexOf(maxAllowed);
}
