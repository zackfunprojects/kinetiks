import { DEFAULT_THRESHOLDS } from "@/lib/approvals/types";

/**
 * The auto-approve threshold for an action category, as a 0..1 fraction for
 * the ConfidenceRing. Falls back to a conservative 0.85 for custom categories.
 * (The per-account tuned threshold lives server-side; this is the baseline the
 * ring marks so the customer can read "earned autonomy" at a glance.)
 */
export function categoryThreshold(category: string): number {
  return (DEFAULT_THRESHOLDS[category] ?? 85) / 100;
}

export function confidenceFraction(score: number | null): number {
  return (score ?? 0) / 100;
}
