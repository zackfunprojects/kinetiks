/**
 * Trust through tempo (collaborative-workspace-spec §9.2). The Approval System's
 * confidence-based autonomy maps onto the presence model: the lower the
 * confidence, the slower and more annotated the system works; the higher it is,
 * the faster and quieter, until — at or above the auto-approve threshold — the
 * work happens in the background with no panel and only a retrospective.
 *
 * Pure module: confidence in, tempo out. Unit-tested without any UI.
 */

export type TempoBand = "low" | "medium" | "high" | "auto";

export interface ConfidenceTempo {
  band: TempoBand;
  /** Playback speed multiplier — higher = faster (shorter holds). */
  speedMultiplier: number;
  /** Fraction of decision points that get an annotation (0..1). */
  annotationDensity: number;
  /** Whether the work auto-approves (no panel opens, retrospective only). */
  autoApprove: boolean;
}

/**
 * Map a confidence score (0–100) to a working tempo. `autoApproveThreshold`
 * defaults to 100 (day-one everything-approved), so only confidence at/above
 * the category's calibrated threshold reaches the `auto` band.
 *
 * - low    (<50):                slow, every decision annotated
 * - medium (50–79):              moderate, key decisions annotated
 * - high   (80–threshold):       fast, minimal annotations
 * - auto   (>= threshold):       background, no annotations, retrospective only
 */
export function tempoForConfidence(
  confidence: number,
  autoApproveThreshold = 100,
): ConfidenceTempo {
  const c = Math.max(0, Math.min(100, confidence));
  if (c >= autoApproveThreshold) {
    return { band: "auto", speedMultiplier: 2, annotationDensity: 0, autoApprove: true };
  }
  if (c >= 80) {
    return { band: "high", speedMultiplier: 1.6, annotationDensity: 0.2, autoApprove: false };
  }
  if (c >= 50) {
    return { band: "medium", speedMultiplier: 1, annotationDensity: 0.5, autoApprove: false };
  }
  return { band: "low", speedMultiplier: 0.5, annotationDensity: 1, autoApprove: false };
}
