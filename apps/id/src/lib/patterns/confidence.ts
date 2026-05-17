/**
 * Pinned Phase 1 confidence formula per the 2027 addendum §1.6.
 *
 * The formula is intentionally simple, deterministic, and inspectable.
 * Phase 2 calibration layers LLM-judged stability evaluation and tunes
 * `effective_decay_days` within `decay_bounds`; the Phase 1 formula
 * stays as the deterministic baseline.
 *
 *   confidence_score = w_obs       * obs_term
 *                    + w_recency   * recency_term
 *                    + w_stability * stability_term
 *
 *   w_obs       = 0.5
 *   w_recency   = 0.2
 *   w_stability = 0.3
 *
 *   obs_term       = 1 - exp(-observation_count / k_obs),  k_obs = 8
 *   recency_term   = exp(-days_since_last_observation / k_recency),
 *                    k_recency = effective_decay_days / 2
 *   stability_term = 1 - clamp(0, 1, normalized_variance(primary_metric_values))
 *                    normalized_variance = sample_variance / (sample_mean^2 + epsilon)
 *                    epsilon = 1e-6
 *                    (when observation_count < 2, stability_term = 0)
 *
 * Suppression projection is a separate function: storage value is
 * unchanged when the customer suppresses; reads of the projected score
 * return 0.
 */

// ============================================================
// Pinned constants (spec, not code-only)
// ============================================================
export const CONFIDENCE_WEIGHTS = {
  w_obs: 0.5,
  w_recency: 0.2,
  w_stability: 0.3,
} as const;

export const CONFIDENCE_CONSTANTS = {
  k_obs: 8,
  /** stability uses normalized_variance / (mean^2 + EPSILON) */
  epsilon: 1e-6,
} as const;

// Sanity: weights sum to 1.0 (a Phase 1 invariant).
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
((): void => {
  const sum =
    CONFIDENCE_WEIGHTS.w_obs +
    CONFIDENCE_WEIGHTS.w_recency +
    CONFIDENCE_WEIGHTS.w_stability;
  if (Math.abs(sum - 1) > 1e-9) {
    throw new Error(
      `[patterns/confidence] Phase 1 invariant violated: weights must sum to 1.0 (got ${sum}).`,
    );
  }
})();

// ============================================================
// Inputs
// ============================================================

export interface ConfidenceInput {
  /** Count of distinct Ledger evidence events backing this pattern. */
  observation_count: number;
  /** Days since the most recent emission (now - last_observed_at, in days). */
  days_since_last_observation: number;
  /** effective_decay_days on the row at the time of compute. */
  effective_decay_days: number;
  /**
   * Primary metric values from the most recent N observations. Used for
   * stability term. Length is bounded by the caller (typically capped at
   * 50, matching evidence_summary.last_n_ledger_ids).
   */
  primary_metric_values: number[];
}

// ============================================================
// Helpers (exported for tests + reusability)
// ============================================================

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function observationTerm(observationCount: number): number {
  if (observationCount <= 0) return 0;
  return 1 - Math.exp(-observationCount / CONFIDENCE_CONSTANTS.k_obs);
}

export function recencyTerm(
  daysSinceLastObservation: number,
  effectiveDecayDays: number,
): number {
  if (effectiveDecayDays <= 0) {
    // Defensive: a row's effective_decay_days is constrained > 0 by the
    // table CHECK constraint, but the function should still degrade
    // gracefully (zero recency credit) rather than NaN.
    return 0;
  }
  const k_recency = effectiveDecayDays / 2;
  const days = Math.max(0, daysSinceLastObservation);
  return Math.exp(-days / k_recency);
}

export function stabilityTerm(values: number[]): number {
  if (values.length < 2) {
    // No variance signal with fewer than 2 samples per spec.
    return 0;
  }
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  // Sample variance (Bessel-corrected).
  let sqSum = 0;
  for (const v of values) {
    const d = v - mean;
    sqSum += d * d;
  }
  const variance = sqSum / (values.length - 1);
  const normalized = variance / (mean * mean + CONFIDENCE_CONSTANTS.epsilon);
  return 1 - clamp01(normalized);
}

// ============================================================
// Score
// ============================================================

export function computeConfidenceScore(input: ConfidenceInput): number {
  const obs = observationTerm(input.observation_count);
  const recency = recencyTerm(
    input.days_since_last_observation,
    input.effective_decay_days,
  );
  const stability = stabilityTerm(input.primary_metric_values);

  const raw =
    CONFIDENCE_WEIGHTS.w_obs * obs +
    CONFIDENCE_WEIGHTS.w_recency * recency +
    CONFIDENCE_WEIGHTS.w_stability * stability;

  return clamp01(raw);
}

// ============================================================
// Read-time projection
// ============================================================

/**
 * Project the stored `confidence_score` for a read. Suppressed patterns
 * project to 0; the storage value is unchanged. Starred patterns retain
 * their computed confidence.
 */
export function projectConfidenceForRead(args: {
  stored_score: number;
  user_suppressed: boolean;
}): number {
  return args.user_suppressed ? 0 : args.stored_score;
}
