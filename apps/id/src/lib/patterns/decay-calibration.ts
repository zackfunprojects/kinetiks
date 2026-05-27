/**
 * Phase 2 empirical decay calibration per the Kinetiks Contract
 * Addendum §1.6, with one acknowledged divergence:
 *
 *   - The Addendum prescribes a separate `kinetiks_pattern_decay_calibration`
 *     table keyed by (account_id, pattern_type), with per-pattern
 *     `effective_decay_days` denormalized from it. Phase 2 implements
 *     PER-PATTERN calibration instead: each fingerprint calibrates
 *     from its own Welford-merged variance and its own lifecycle
 *     history. The audit trail lives in `kinetiks_ledger` entries of
 *     event_type `pattern_decay_calibrated`. This is strictly more
 *     flexible (a volatile fingerprint inside a generally-stable
 *     pattern type calibrates independently) and removes the need
 *     for a new table.
 *
 *   - The divergence does not change the customer-facing surface,
 *     the registry contract, the decay bounds, or the `query_patterns`
 *     read path.
 *
 * Algorithm:
 *
 *   1. Eligibility gates (any failure → decision='skip', no Ledger).
 *   2. Stability signal = stability_term from confidence.ts compared to
 *      this descriptor's `confidence_thresholds.validate_at` /
 *      `decline_at`. Reuses the pinned formula so calibration aligns
 *      with confidence semantics.
 *   3. Lifecycle history signal = count of `pattern_arbitrated`
 *      Ledger entries with `detail.to='declining'` for this pattern
 *      in the last `CALIBRATION_WINDOW_DAYS`.
 *   4. Combine: both stable (or one stable + neutral) → extend.
 *      Both unstable (or one unstable + neutral) → shorten. Mixed
 *      or both neutral → no_move.
 *   5. Clamp into descriptor's `[decay_floor_days, decay_ceiling_days]`.
 *   6. Dead-band: if `|next - prior| / prior < DEAD_BAND_RATIO` after
 *      clamp, override to no_move. Prevents thrashing at clamps.
 *   7. Recompute `decay_at = last_observed_at + next_effective_decay_days`.
 *
 * No status transitions happen here. The Archivist's existing
 * time-decay sweep operates on the freshly-calibrated `decay_at`
 * on its next 6h tick.
 */

import type { Pattern, PatternTypeDescriptor } from "@kinetiks/types";

// ============================================================
// Pinned constants
// ============================================================

/** Multiplier applied when calibration extends `effective_decay_days`. */
export const EXTEND_MULTIPLIER = 1.1;

/** Multiplier applied when calibration shortens `effective_decay_days`. */
export const SHORTEN_MULTIPLIER = 0.9;

/**
 * If `|next - prior| / prior` is below this ratio after clamping,
 * calibration is short-circuited to `no_move`. Prevents thrashing
 * when a pattern sits at or near `decay_floor_days` / `decay_ceiling_days`.
 */
export const DEAD_BAND_RATIO = 0.05;

/** Lookback window for the declining-transitions lifecycle signal. */
export const CALIBRATION_WINDOW_DAYS = 30;

/**
 * Belt-and-suspenders: patterns whose `last_observed_at` predates this
 * many days are skipped. In practice the time-decay sweep should have
 * already archived them; this gate exists so a stale row that escaped
 * the sweep does not get its decay adjusted.
 */
export const STALE_THRESHOLD_DAYS = 365;

/**
 * Used to drop a stable-signal contribution when there is exactly one
 * declining transition in the window — that's a single oscillation,
 * neutral signal.
 */
const DECLINING_NEUTRAL_COUNT = 1;
const DECLINING_UNSTABLE_THRESHOLD = 2;

const EPSILON = 1e-6;

// ============================================================
// Inputs / outputs
// ============================================================

export interface CalibrationInput {
  pattern: Pattern;
  descriptor: PatternTypeDescriptor;
  /**
   * Count of `pattern_arbitrated` Ledger entries with
   * `detail.to='declining'` for this pattern's id in the last
   * `CALIBRATION_WINDOW_DAYS`. The caller fetches this from
   * `kinetiks_ledger`; the calibration function is pure.
   */
  recent_declining_count: number;
  /** Injected "now" for deterministic tests; defaults to current Date. */
  now: Date;
}

export type CalibrationDecisionKind =
  | "extend"
  | "shorten"
  | "no_move"
  | "skip";

export interface CalibrationDecision {
  decision: CalibrationDecisionKind;
  /** Value before calibration (always equals pattern.effective_decay_days). */
  prior_effective_decay_days: number;
  /** Value after calibration. Equals prior on no_move and skip. */
  next_effective_decay_days: number;
  /** `decay_at` before calibration. */
  prior_decay_at: string;
  /** `decay_at` after calibration. Equals prior on no_move and skip. */
  next_decay_at: string;
  /** Plain-language rationale, captured in the Ledger entry. */
  rationale: string;
}

// ============================================================
// Helpers
// ============================================================

function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function daysBetween(a: Date, bIso: string): number {
  return (a.getTime() - new Date(bIso).getTime()) / 86_400_000;
}

/**
 * Same shape as `stabilityTerm` in `confidence.ts` but operating on
 * pre-aggregated (mean, variance) — patterns store these on the row
 * via Welford merge in `pattern-write.ts`.
 *
 * Returns 1 - clamp01(variance / (mean^2 + EPSILON)). High mean +
 * low variance → near 1.0 (stable); low mean + comparable variance
 * → near 0 (unstable).
 */
function stabilityTermFromAggregate(mean: number, variance: number): number {
  const normalized = variance / (mean * mean + EPSILON);
  return 1 - clamp01(normalized);
}

type StabilityClassification = "stable" | "unstable" | "neutral";

function classifyStability(
  pattern: Pattern,
  descriptor: PatternTypeDescriptor,
): { term: number; classification: StabilityClassification } {
  // Eligibility callers ensure variance != null and observation_count >= 2
  const variance = pattern.variance ?? 0;
  const term = stabilityTermFromAggregate(pattern.outcome_value, variance);
  const { validate_at, decline_at } = descriptor.confidence_thresholds;
  if (term >= validate_at) return { term, classification: "stable" };
  if (term <= decline_at) return { term, classification: "unstable" };
  return { term, classification: "neutral" };
}

type LifecycleClassification = "stable" | "unstable" | "neutral";

function classifyLifecycle(count: number): LifecycleClassification {
  if (count === 0) return "stable";
  if (count >= DECLINING_UNSTABLE_THRESHOLD) return "unstable";
  // count === DECLINING_NEUTRAL_COUNT (== 1) → neutral
  return "neutral";
}

function combineSignals(
  stability: StabilityClassification,
  lifecycle: LifecycleClassification,
): "extend" | "shorten" | "no_move" {
  // Mixed (one stable, one unstable) → no_move
  if (stability === "stable" && lifecycle === "unstable") return "no_move";
  if (stability === "unstable" && lifecycle === "stable") return "no_move";
  // Both stable (or one stable + neutral) → extend
  if (stability === "stable" || lifecycle === "stable") {
    if (stability === "unstable" || lifecycle === "unstable") return "no_move";
    return "extend";
  }
  // Both unstable (or one unstable + neutral) → shorten
  if (stability === "unstable" || lifecycle === "unstable") return "shorten";
  // Both neutral → no_move
  return "no_move";
}

// ============================================================
// Public API
// ============================================================

export function calibratePattern(input: CalibrationInput): CalibrationDecision {
  const { pattern, descriptor, recent_declining_count, now } = input;
  const prior = pattern.effective_decay_days;
  const priorDecayAt = pattern.decay_at;

  // ── Eligibility gates ─────────────────────────────────────
  if (pattern.status === "archived") {
    return {
      decision: "skip",
      prior_effective_decay_days: prior,
      next_effective_decay_days: prior,
      prior_decay_at: priorDecayAt,
      next_decay_at: priorDecayAt,
      rationale: "Pattern is archived; calibration not applicable.",
    };
  }

  const threshold = descriptor.decay_bounds.calibration_sample_threshold;
  if (pattern.observation_count < threshold) {
    return {
      decision: "skip",
      prior_effective_decay_days: prior,
      next_effective_decay_days: prior,
      prior_decay_at: priorDecayAt,
      next_decay_at: priorDecayAt,
      rationale: `observation_count ${pattern.observation_count} below threshold ${threshold}; not enough evidence to calibrate.`,
    };
  }

  if (pattern.variance === null || pattern.variance === undefined) {
    return {
      decision: "skip",
      prior_effective_decay_days: prior,
      next_effective_decay_days: prior,
      prior_decay_at: priorDecayAt,
      next_decay_at: priorDecayAt,
      rationale: "variance is null; no stability signal available.",
    };
  }

  if (pattern.observation_count < 2) {
    return {
      decision: "skip",
      prior_effective_decay_days: prior,
      next_effective_decay_days: prior,
      prior_decay_at: priorDecayAt,
      next_decay_at: priorDecayAt,
      rationale: `observation_count ${pattern.observation_count} below 2; variance signal not meaningful.`,
    };
  }

  const lastObservedAgeDays = daysBetween(now, pattern.last_observed_at);
  if (lastObservedAgeDays > STALE_THRESHOLD_DAYS) {
    return {
      decision: "skip",
      prior_effective_decay_days: prior,
      next_effective_decay_days: prior,
      prior_decay_at: priorDecayAt,
      next_decay_at: priorDecayAt,
      rationale: `Last observed ${Math.round(lastObservedAgeDays)} days ago; stale beyond ${STALE_THRESHOLD_DAYS}-day threshold.`,
    };
  }

  // ── Compute signals ───────────────────────────────────────
  const stability = classifyStability(pattern, descriptor);
  const lifecycle = classifyLifecycle(recent_declining_count);
  const direction = combineSignals(stability.classification, lifecycle);

  // ── No_move branch (mixed or both neutral) ────────────────
  if (direction === "no_move") {
    return {
      decision: "no_move",
      prior_effective_decay_days: prior,
      next_effective_decay_days: prior,
      prior_decay_at: priorDecayAt,
      next_decay_at: priorDecayAt,
      rationale: renderRationale({
        direction: "no_move",
        stability,
        lifecycle,
        recent_declining_count,
        prior,
        next: prior,
        descriptor,
        clamped: false,
      }),
    };
  }

  // ── Apply multiplier, then clamp ─────────────────────────
  const rawNext =
    direction === "extend" ? prior * EXTEND_MULTIPLIER : prior * SHORTEN_MULTIPLIER;
  const clamped = clamp(
    rawNext,
    descriptor.decay_bounds.decay_floor_days,
    descriptor.decay_bounds.decay_ceiling_days,
  );
  const clampedHit = clamped !== rawNext;

  // ── Dead band ────────────────────────────────────────────
  const moveRatio = Math.abs(clamped - prior) / Math.max(prior, EPSILON);
  if (moveRatio < DEAD_BAND_RATIO) {
    return {
      decision: "no_move",
      prior_effective_decay_days: prior,
      next_effective_decay_days: prior,
      prior_decay_at: priorDecayAt,
      next_decay_at: priorDecayAt,
      // Render as no_move so the audit text matches the decision.
      // The dead-band rationale branch surfaces the attempted-but-
      // suppressed direction via the `attempted_direction` field.
      rationale: renderRationale({
        direction: "no_move",
        attempted_direction: direction,
        stability,
        lifecycle,
        recent_declining_count,
        prior,
        next: clamped,
        descriptor,
        clamped: clampedHit,
        deadBand: true,
      }),
    };
  }

  // ── Recompute decay_at from last_observed_at ─────────────
  const nextDecayAt = new Date(
    new Date(pattern.last_observed_at).getTime() + clamped * 86_400_000,
  ).toISOString();

  return {
    decision: direction,
    prior_effective_decay_days: prior,
    next_effective_decay_days: clamped,
    prior_decay_at: priorDecayAt,
    next_decay_at: nextDecayAt,
    rationale: renderRationale({
      direction,
      stability,
      lifecycle,
      recent_declining_count,
      prior,
      next: clamped,
      descriptor,
      clamped: clampedHit,
    }),
  };
}

// ============================================================
// Rationale rendering (LLM-readable, Ledger-friendly)
// ============================================================

function renderRationale(args: {
  direction: "extend" | "shorten" | "no_move";
  /** Only set when direction='no_move' due to dead-band suppression. */
  attempted_direction?: "extend" | "shorten";
  stability: { term: number; classification: StabilityClassification };
  lifecycle: LifecycleClassification;
  recent_declining_count: number;
  prior: number;
  next: number;
  descriptor: PatternTypeDescriptor;
  clamped: boolean;
  deadBand?: boolean;
}): string {
  const stabilityWord =
    args.stability.classification === "stable"
      ? "stable"
      : args.stability.classification === "unstable"
        ? "unstable"
        : "neutral";
  const stabilityPart = `stability_term=${args.stability.term.toFixed(3)} (${stabilityWord} vs validate_at=${args.descriptor.confidence_thresholds.validate_at}/decline_at=${args.descriptor.confidence_thresholds.decline_at})`;
  const lifecyclePart = `${args.recent_declining_count} declining transition(s) in last ${CALIBRATION_WINDOW_DAYS}d (${args.lifecycle})`;

  if (args.direction === "no_move") {
    if (args.deadBand) {
      const edge =
        args.next === args.descriptor.decay_bounds.decay_ceiling_days
          ? "ceiling"
          : args.next === args.descriptor.decay_bounds.decay_floor_days
            ? "floor"
            : "dead-band";
      const attempted = args.attempted_direction
        ? ` Attempted ${args.attempted_direction} suppressed.`
        : "";
      return `No move (${edge}; move ratio below ${DEAD_BAND_RATIO}).${attempted} ${stabilityPart}. ${lifecyclePart}.`;
    }
    const mixed =
      args.stability.classification !== "neutral" &&
      args.lifecycle !== "neutral" &&
      args.stability.classification !== args.lifecycle;
    if (mixed) {
      return `No move (mixed signal). ${stabilityPart}. ${lifecyclePart}.`;
    }
    return `No move (neutral signal). ${stabilityPart}. ${lifecyclePart}.`;
  }

  const arrow = args.direction === "extend" ? "→ extend" : "→ shorten";
  const clampNote = args.clamped
    ? ` (clamped to ${args.direction === "extend" ? "ceiling" : "floor"})`
    : "";
  return `${arrow} effective_decay_days ${args.prior} → ${args.next}${clampNote}. ${stabilityPart}. ${lifecyclePart}.`;
}
