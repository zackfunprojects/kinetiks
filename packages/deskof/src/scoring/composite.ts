import type { MatchBreakdown } from "../types/opportunity";

/**
 * Composite match score for an opportunity.
 *
 * Per CLAUDE.md and Product Brief §4.1:
 *
 *   match_score = (
 *     expertise_fit       * 0.30 +
 *     timing_score        * 0.20 +
 *     citation_prob       * 0.25 +
 *     answer_gap          * 0.20 +
 *     anti_signal_penalty * 0.05
 *   )
 *
 * Free tier scoring (Phase 2): expertise_fit + thread freshness only.
 * Hero tier (Phase 8): weights customizable per user.
 *
 * Returns a 0-100 integer score.
 */

export const DEFAULT_WEIGHTS: ScoringWeights = {
  expertise_fit: 0.3,
  timing_score: 0.2,
  citation_probability: 0.25,
  answer_gap_score: 0.2,
  anti_signal_penalty: 0.05,
};

export interface ScoringWeights {
  expertise_fit: number;
  timing_score: number;
  citation_probability: number;
  answer_gap_score: number;
  anti_signal_penalty: number;
}

export interface ScoringInput {
  expertise_fit: number;
  timing_score: number;
  citation_probability: number;
  answer_gap_score: number;
  /** Number of anti-signal flags. Penalty grows linearly with count, capped. */
  anti_signal_count: number;
}

export function computeMatchScore(
  input: ScoringInput,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): number {
  validateWeights(weights);

  const antiSignalScore = Math.max(0, 1 - input.anti_signal_count * 0.25);

  const composite =
    clamp01(input.expertise_fit) * weights.expertise_fit +
    clamp01(input.timing_score) * weights.timing_score +
    clamp01(input.citation_probability) * weights.citation_probability +
    clamp01(input.answer_gap_score) * weights.answer_gap_score +
    antiSignalScore * weights.anti_signal_penalty;

  return Math.round(composite * 100);
}

export function buildBreakdown(
  input: ScoringInput,
  flags: string[] = []
): MatchBreakdown {
  return {
    expertise_fit: clamp01(input.expertise_fit),
    timing_score: clamp01(input.timing_score),
    citation_probability: clamp01(input.citation_probability),
    answer_gap_score: clamp01(input.answer_gap_score),
    anti_signal_flags: flags,
  };
}

function validateWeights(weights: ScoringWeights): void {
  const sum =
    weights.expertise_fit +
    weights.timing_score +
    weights.citation_probability +
    weights.answer_gap_score +
    weights.anti_signal_penalty;
  // Allow tiny floating point drift
  if (Math.abs(sum - 1) > 0.001) {
    throw new Error(
      `Scoring weights must sum to 1.0, got ${sum.toFixed(4)}`
    );
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
