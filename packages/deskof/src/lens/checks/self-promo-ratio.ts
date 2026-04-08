/**
 * Self-promotion ratio check (computational, runs on every tier).
 *
 * Reads the 30-day rolling self-promo ratio from PlatformHealthSnapshot
 * (computed and persisted by `apps/do/src/lib/lens/platform-health.ts`)
 * and compares it against the calibrated thresholds.
 *
 * If no snapshot exists yet (brand new user) → check passes silently.
 * Refusing to surface a noisy "no data" advisory is what the spec
 * calls "graceful degradation" in CLAUDE.md §Error Handling.
 */

import type { GateCheck } from "../../types/gate";
import type { LensConfig, LensInput } from "../types";
import { CHECK_DEFAULTS } from "./defaults";

export function checkSelfPromoRatio(
  input: LensInput,
  config: LensConfig
): GateCheck | null {
  const snapshot = input.platformHealth;
  if (!snapshot || snapshot.posts_total === 0) {
    return null;
  }

  // Convention: higher sensitivity → MORE strict (lower thresholds).
  // Divide so a 1.5x sensitivity tightens the bar by ~33%.
  const sensitivity = config.sensitivity.self_promo_ratio ?? 1.0;
  const thresholds =
    config.thresholds.self_promo_ratio ?? CHECK_DEFAULTS.self_promo_ratio;
  const advisory = thresholds.advisory / sensitivity;
  const blocking = thresholds.blocking / sensitivity;

  const ratio = snapshot.self_promo_ratio;

  if (ratio >= blocking) {
    return {
      type: "self_promo_ratio",
      passed: false,
      severity: "blocking",
      message: `Your 30-day promotional ratio on ${snapshot.platform} is ${pct(ratio)}, well above the healthy ${pct(blocking)} ceiling.`,
      recommendation:
        "Post 3-5 non-promotional replies before sharing anything that mentions your products.",
    };
  }
  if (ratio >= advisory) {
    return {
      type: "self_promo_ratio",
      passed: false,
      severity: "warning",
      message: `Your 30-day promotional ratio on ${snapshot.platform} is ${pct(ratio)} — approaching the ${pct(blocking)} ceiling.`,
      recommendation:
        "Mix in a few helpful, non-promotional replies before this one to keep the ratio healthy.",
    };
  }
  return {
    type: "self_promo_ratio",
    passed: true,
    severity: "info",
    message: `Your 30-day promotional ratio on ${snapshot.platform} is ${pct(ratio)} — healthy.`,
    recommendation: "",
  };
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
