/**
 * Cross-Platform Promotional Index (Quality Addendum #4).
 *
 * Rolling 7-day metric tracking promotional activity across all
 * connected platforms as a unified view. Catches the case where a
 * user has healthy per-platform ratios but unhealthy combined behavior.
 *
 * CPPI = (volume * 0.4) + (concentration * 0.35) + (clustering * 0.25)
 *
 * Levels:
 *   low      < 0.40
 *   moderate 0.40 - 0.60
 *   high     0.60 - 0.80
 *   critical > 0.80
 */

export type CPPILevel = "low" | "moderate" | "high" | "critical";

export interface CPPI {
  /** Composite 0-1 score */
  score: number;
  /** promotional_count / total_count over rolling 7 days */
  volume: number;
  /** Product concentration (0 = spread across many products, 1 = all same product) */
  concentration: number;
  /** Temporal clustering coefficient (0 = evenly spread, 1 = all in one burst) */
  clustering: number;
  level: CPPILevel;
}

const VOLUME_WEIGHT = 0.4;
const CONCENTRATION_WEIGHT = 0.35;
const CLUSTERING_WEIGHT = 0.25;

/**
 * Compute the composite CPPI score from its three dimensions and
 * classify into a level. Pure function — no IO.
 */
export function computeCppiScore(
  volume: number,
  concentration: number,
  clustering: number
): CPPI {
  const clampedVolume = clamp01(volume);
  const clampedConcentration = clamp01(concentration);
  const clampedClustering = clamp01(clustering);

  const score =
    clampedVolume * VOLUME_WEIGHT +
    clampedConcentration * CONCENTRATION_WEIGHT +
    clampedClustering * CLUSTERING_WEIGHT;

  return {
    score,
    volume: clampedVolume,
    concentration: clampedConcentration,
    clustering: clampedClustering,
    level: classifyCppi(score),
  };
}

export function classifyCppi(score: number): CPPILevel {
  if (score < 0.4) return "low";
  if (score < 0.6) return "moderate";
  if (score < 0.8) return "high";
  return "critical";
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
