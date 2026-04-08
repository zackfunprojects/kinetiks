/**
 * Scout v1 — keyword-based discovery engine.
 *
 * Phase 2's job is to deliver the core write loop (discover → write →
 * post). The full discovery engine (timing model, citation prediction,
 * answer gap detection, anti-signal filtering, suggested angles) lands
 * in Phase 4. Phase 2 ships a deliberately simple matcher so the loop
 * works end to end while we collect the data needed for Phase 4.
 *
 * Scout v1 only computes:
 *   - expertise_fit  — keyword overlap between thread topic and the
 *                       Operator Profile expertise tiers
 *   - timing_score   — thread freshness (newer threads score higher)
 *
 * The other dimensions of the composite score are zeroed out, and the
 * computeMatchScore math from @kinetiks/deskof handles the formula.
 *
 * Scout v1 operates on the platform-agnostic ThreadSnapshot, so it
 * doesn't know or care whether the thread came from Reddit or Quora.
 */
import "server-only";
import {
  computeMatchScore,
  buildBreakdown,
  type Opportunity,
  type ThreadSnapshot,
  type SkipReason,
  type ExpertiseTierLevel,
  type OpportunityType,
} from "@kinetiks/deskof";
import {
  findMatchingTier,
  type OperatorProfile,
} from "@kinetiks/cortex";

const FRESHNESS_HALF_LIFE_HOURS = 36; // ~1.5 days

export interface ScoutOptions {
  /** Cap the number of opportunities returned */
  limit?: number;
  /** Drop opportunities below this match score */
  min_score?: number;
  /** How long the surfaced opportunity stays valid */
  expiration_hours?: number;
}

export interface ScoutResult {
  thread: ThreadSnapshot;
  opportunity: Omit<Opportunity, "id" | "user_id">;
  /** True if Scout filtered this thread instead of surfacing it */
  filtered?: { reason: string };
}

/**
 * Score a batch of threads against an Operator Profile and return the
 * top-N as opportunities. Pure function — no IO.
 */
export function scoreThreads(
  threads: ThreadSnapshot[],
  profile: OperatorProfile,
  options: ScoutOptions = {}
): ScoutResult[] {
  const limit = options.limit ?? 50;
  const minScore = options.min_score ?? 30;
  const expirationHours = options.expiration_hours ?? 48;
  const now = Date.now();

  const results: ScoutResult[] = [];

  for (const thread of threads) {
    const topic = inferTopicFromThread(thread);
    const match = findMatchingTier(topic, profile.professional.expertise_tiers);

    if (!match) {
      // No expertise match — but personal-interest pipeline (Phase 7)
      // would still consider this. Phase 2 just drops it.
      continue;
    }

    const expertise_fit = expertiseFitScore(match.level);
    const timing_score = freshnessScore(thread.created_at, now);

    const matchScore = computeMatchScore({
      expertise_fit,
      timing_score,
      citation_probability: 0,
      answer_gap_score: 0,
      anti_signal_count: 0,
    });

    if (matchScore < minScore) continue;

    const breakdown = buildBreakdown({
      expertise_fit,
      timing_score,
      citation_probability: 0,
      answer_gap_score: 0,
      anti_signal_count: 0,
    });

    const opportunityType: OpportunityType =
      match.level === "genuine_curiosity" ? "personal" : "professional";

    results.push({
      thread,
      opportunity: {
        thread,
        match_score: matchScore,
        match_breakdown: breakdown,
        suggested_angle: null, // Phase 4 (gated, Standard+)
        expertise_tier_matched: match.level,
        opportunity_type: opportunityType,
        surfaced_at: new Date(now).toISOString(),
        expires_at: new Date(
          now + expirationHours * 60 * 60 * 1000
        ).toISOString(),
        status: "pending",
      },
    });
  }

  results.sort(
    (a, b) => b.opportunity.match_score - a.opportunity.match_score
  );
  return results.slice(0, limit);
}

/**
 * Phase 2 topic inference is intentionally naive — just normalize the
 * thread title and let findMatchingTier do substring overlap. Phase 4
 * replaces this with embedding similarity once Mirror is producing
 * topic vectors.
 */
function inferTopicFromThread(thread: ThreadSnapshot): string {
  return thread.title.toLowerCase();
}

function expertiseFitScore(level: ExpertiseTierLevel): number {
  switch (level) {
    case "core_authority":
      return 1.0;
    case "credible_adjacency":
      return 0.7;
    case "genuine_curiosity":
      return 0.4;
  }
}

/**
 * Exponential decay over thread age. A thread posted now scores 1.0;
 * after one half-life it scores 0.5; after two half-lives 0.25; etc.
 *
 * Bounded so brand-new threads don't dominate (we want some signal
 * accumulation before surfacing) and ancient threads don't disappear
 * entirely (they may still be the right place to chime in).
 */
function freshnessScore(createdAt: string, nowMs: number): number {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return 0.3;
  const ageHours = Math.max(0, (nowMs - created) / (60 * 60 * 1000));
  const decay = Math.pow(0.5, ageHours / FRESHNESS_HALF_LIFE_HOURS);
  // Bound to [0.05, 0.95] so freshness is one input among many
  return Math.max(0.05, Math.min(0.95, decay));
}

// ----------------------------------------------------------------
// Skip-reason taxonomy (for the Write tab card stack)
// ----------------------------------------------------------------

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  already_well_answered: "Already well answered",
  not_my_expertise: "Not my expertise",
  too_promotional: "Would feel too promotional",
  bad_timing: "Bad timing",
  other: "Other",
};
