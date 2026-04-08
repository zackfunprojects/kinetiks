/**
 * Scout v2 timing model (build-plan §4.1).
 *
 * Combines two signals into a single 0-1 timing_score:
 *   1. Freshness — exponential decay over thread age (1.5-day half life)
 *   2. Velocity  — normalized upvotes_per_hour / comments_per_hour
 *
 * Velocity is what catches the "thread that's about to peak" case
 * Phase 2's freshness-only model misses. A 6-hour-old thread that's
 * clearly trending should outrank a 2-hour-old thread with no
 * engagement, even though freshness alone would say the opposite.
 *
 * Pure, deterministic, synchronous. The Scout engine in apps/do
 * supplies the inputs from the platform-specific clients.
 */

const FRESHNESS_HALF_LIFE_HOURS = 36;

/** Linear normalization caps. Anything above is full credit. */
const PEAK_UPVOTES_PER_HOUR = 30;
const PEAK_COMMENTS_PER_HOUR = 6;

export interface TimingInput {
  /** ISO timestamp the thread was posted on the platform */
  created_at: string;
  /** Optional velocity signals (Phase 4 enrichment) */
  upvotes_per_hour?: number | null;
  comments_per_hour?: number | null;
}

/**
 * 0-1 score combining freshness and velocity. The freshness component
 * is the same exponential decay Phase 2 used; velocity is added on top
 * with a soft cap so a single viral thread can't dominate the queue.
 *
 * The blend is deliberately conservative — 70% freshness, 30% velocity
 * — because the velocity signal is noisy on small samples (a thread
 * with 1 upvote in the first 5 minutes reads as "120 upvotes/hour").
 */
export function computeTimingScore(input: TimingInput, nowMs = Date.now()): number {
  const freshness = freshnessComponent(input.created_at, nowMs);
  const velocity = velocityComponent(
    input.upvotes_per_hour ?? null,
    input.comments_per_hour ?? null
  );
  // No velocity data → freshness alone (Phase 2 compatible).
  if (velocity === null) return freshness;
  return clamp01(freshness * 0.7 + velocity * 0.3);
}

/**
 * Pure freshness exponential decay, exported separately so the
 * unit tests and the seed fixtures can both use it.
 */
export function freshnessComponent(createdAt: string, nowMs: number): number {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return 0.3;
  const ageHours = Math.max(0, (nowMs - created) / (60 * 60 * 1000));
  const decay = Math.pow(0.5, ageHours / FRESHNESS_HALF_LIFE_HOURS);
  // Bound so brand-new threads don't dominate and ancient threads
  // don't disappear entirely.
  return Math.max(0.05, Math.min(0.95, decay));
}

function velocityComponent(
  upsPerHour: number | null,
  commentsPerHour: number | null
): number | null {
  // Sanitize NaN / Infinity FIRST. An upstream rate computation that
  // divides by zero would otherwise poison the score down to 0 and
  // bury otherwise-valid fresh threads. Treat invalid as missing.
  const ups =
    upsPerHour == null || !Number.isFinite(upsPerHour) ? null : upsPerHour;
  const comments =
    commentsPerHour == null || !Number.isFinite(commentsPerHour)
      ? null
      : commentsPerHour;
  if (ups == null && comments == null) return null;
  const upsScore =
    ups == null
      ? 0
      : Math.min(1, Math.max(0, ups) / PEAK_UPVOTES_PER_HOUR);
  const commentsScore =
    comments == null
      ? 0
      : Math.min(1, Math.max(0, comments) / PEAK_COMMENTS_PER_HOUR);
  // 60/40 weighting — comments are a stronger engagement signal than
  // upvotes (a comment commits more attention) but they trail upvotes
  // in early-thread velocity.
  return upsScore * 0.6 + commentsScore * 0.4;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
