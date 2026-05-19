/**
 * Statistical helpers for the Phase 1.5 fixture emitter.
 *
 * Distributions intentionally lean on plausibility, not realism. The
 * goal is to produce a stream of pattern emissions that lights up the
 * Pattern Library lifecycle, Welford merge, decay calibration test
 * bench, Marcus brief inclusion, and Ledger writes — without
 * fabricating customer data.
 *
 * No external RNG: Math.random is used directly. Fixture rows are
 * disposable and not test fixtures; determinism would only matter if
 * fixture output were itself assertable, which it isn't.
 */

/**
 * Box-Muller normal sample. Returns a value drawn from a normal
 * distribution with the given mean and standard deviation, then
 * clipped to [min, max].
 */
export function clippedNormal(
  mean: number,
  stdDev: number,
  min: number,
  max: number,
): number {
  // Box-Muller transform; reject u1 = 0 to avoid log(0).
  let u1 = 0;
  while (u1 === 0) u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const raw = mean + z0 * stdDev;
  if (raw < min) return min;
  if (raw > max) return max;
  return raw;
}

/** Continuous uniform sample in [min, max). */
export function uniform(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Inclusive uniform integer sample in [min, max]. */
export function uniformInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** Uniform pick from a non-empty array. */
export function pickRandom<T>(arr: ReadonlyArray<T>): T {
  if (arr.length === 0) {
    throw new Error("pickRandom: empty array");
  }
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

/**
 * Weighted pick from a non-empty array. Weights must be positive and
 * non-empty; they need not sum to 1 (they're normalized internally).
 */
export function pickWeighted<T>(
  choices: ReadonlyArray<T>,
  weights: ReadonlyArray<number>,
): T {
  if (choices.length === 0) {
    throw new Error("pickWeighted: empty choices");
  }
  if (choices.length !== weights.length) {
    throw new Error("pickWeighted: choices and weights must be same length");
  }
  let total = 0;
  for (const w of weights) {
    if (!Number.isFinite(w) || w < 0) {
      throw new Error("pickWeighted: weights must be non-negative finite");
    }
    total += w;
  }
  if (total === 0) {
    throw new Error("pickWeighted: all weights are zero");
  }
  let r = Math.random() * total;
  for (let i = 0; i < choices.length; i++) {
    r -= weights[i] as number;
    if (r <= 0) return choices[i] as T;
  }
  // Floating-point edge case — return the last element.
  return choices[choices.length - 1] as T;
}

/**
 * Stability profile for a generator. Stable profiles produce tight
 * clustering and low variance — those patterns will likely validate
 * quickly and stay validated, which exercises the "extend decay"
 * branch of Phase 2 calibration. Unstable profiles produce wider
 * spreads and higher variance, exercising the "shorten decay" branch.
 */
export type StabilityProfile = "stable" | "unstable";

export interface SampledOutcome {
  outcome_value: number;
  variance: number;
  sample_size: number;
}

/**
 * Sample a clipped-normal outcome value plus a plausible variance and
 * sample size. For ratio metrics in [0, 1]:
 *
 *   stable:   stdDev ≈ 0.4 × |mean − floor| (tight), n in [25, 80]
 *   unstable: stdDev ≈ 0.9 × |mean − floor| (loose), n in [8, 35]
 *
 * variance is set to stdDev^2 directly (the parameter that drove the
 * sample), not re-estimated — fixtures are observations, the variance
 * we report is the one we drew from.
 */
export function sampleRatioOutcome(args: {
  mean: number;
  profile: StabilityProfile;
  min?: number;
  max?: number;
}): SampledOutcome {
  const min = args.min ?? 0;
  const max = args.max ?? 1;
  if (!Number.isFinite(args.mean) || !Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error(
      `sampleRatioOutcome: mean/min/max must be finite (got mean=${args.mean}, min=${min}, max=${max})`,
    );
  }
  if (min >= max) {
    throw new Error(`sampleRatioOutcome: min (${min}) must be less than max (${max})`);
  }
  if (args.mean < min || args.mean > max) {
    throw new Error(
      `sampleRatioOutcome: mean (${args.mean}) must lie within [${min}, ${max}]`,
    );
  }
  // Spread distance is from the mean to the nearer bound (floor or ceiling),
  // so very-near-zero rates don't get huge stdDev.
  const room = Math.min(args.mean - min, max - args.mean);
  const stdDev =
    args.profile === "stable" ? Math.max(0.005, room * 0.4) : Math.max(0.01, room * 0.9);
  const outcome_value = clippedNormal(args.mean, stdDev, min, max);
  const sample_size =
    args.profile === "stable" ? uniformInt(25, 80) : uniformInt(8, 35);
  return {
    outcome_value,
    variance: stdDev * stdDev,
    sample_size,
  };
}
