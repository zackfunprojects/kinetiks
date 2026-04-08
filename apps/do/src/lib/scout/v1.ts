/**
 * Scout v2 — full discovery engine (build-plan §Phase 4).
 *
 * Upgrades the Phase 2 keyword-only matcher to the spec'd composite
 * model:
 *
 *   1. Expertise fit       — Operator Profile tier matching (kept from v1)
 *   2. Timing score        — freshness + velocity blend (Phase 4 §4.1)
 *   3. Citation probability — DEFERRED (Phase 0 model not built)
 *   4. Answer gap score    — LLM analysis of thread vs operator (Phase 4 §4.3)
 *   5. Anti-signal flags   — cold-entry, hostility, mature-thread, promo-tension,
 *                            duplicate-coverage (Phase 4 §4.4)
 *   6. Suggested angle     — one-line LLM hint, NEVER a draft (§4.6)
 *
 * Threads with at least one HARD anti-signal flag are filtered out
 * of the queue and logged into `deskof_filtered_threads` so the
 * filtered-feed UI can surface them with educational reasons (§4.7).
 *
 * The actual scoring math lives in `@kinetiks/deskof` (pure). This
 * module is the IO layer that hydrates inputs from Supabase + the
 * Operator Profile and orchestrates the LLM enrichment pass for the
 * top-N candidates.
 *
 * LLM behavior: answer-gap and suggested-angle calls run only for
 * the top candidates (cost control), and silently degrade to "no
 * signal" if the LLM client is unavailable. Same contract as Lens.
 */
import "server-only";
import {
  buildBreakdown,
  collectAntiSignals,
  computeMatchScore,
  computeTimingScore,
  type AntiSignalContext,
  type AntiSignalFlag,
  type ExpertiseTierLevel,
  type FilterReason,
  type Opportunity,
  type OpportunityType,
  type SkipReason,
  type ThreadSnapshot,
} from "@kinetiks/deskof";
import {
  findMatchingTier,
  type OperatorProfile,
} from "@kinetiks/cortex";
import { analyzeAnswerGap, generateSuggestedAngle } from "./llm";

export interface ScoutOptions {
  /** Cap the number of opportunities returned */
  limit?: number;
  /** Drop opportunities below this match score */
  min_score?: number;
  /** How long the surfaced opportunity stays valid */
  expiration_hours?: number;
  /** How many of the top candidates get LLM enrichment (cost control) */
  llm_enrichment_top_n?: number;
}

export interface ScoutSurfaced {
  thread: ThreadSnapshot;
  opportunity: Omit<Opportunity, "id" | "user_id">;
  /** Soft anti-signal flags that were attached but did not filter the thread */
  anti_signal_flags: AntiSignalFlag[];
}

export interface ScoutFiltered {
  thread: ThreadSnapshot;
  reason: FilterReason;
  detail: string;
  /** What the match_score WOULD have been without the hard flag */
  hypothetical_score: number;
}

export interface ScoutResult {
  surfaced: ScoutSurfaced[];
  filtered: ScoutFiltered[];
}

export interface ScoutHydratedInput {
  threads: ThreadSnapshot[];
  profile: OperatorProfile;
  /** Last-7-day reply count by community for duplicate-coverage detection */
  recent_replies_by_community?: ReadonlyMap<string, number>;
}

/**
 * Score a batch of threads and return surfaced opportunities + a
 * filtered list (for the Quality Addendum #7 filtered feed).
 *
 * Computational pass is synchronous; LLM enrichment runs as a
 * Promise.allSettled batch on the top-N candidates. The composite
 * score is RECOMPUTED for enriched candidates so a strong answer-gap
 * score can lift a thread above its initial ranking.
 */
export async function runScout(
  input: ScoutHydratedInput,
  options: ScoutOptions = {}
): Promise<ScoutResult> {
  const limit = options.limit ?? 50;
  const minScore = options.min_score ?? 30;
  const expirationHours = options.expiration_hours ?? 48;
  const llmTopN = options.llm_enrichment_top_n ?? 5;
  const now = Date.now();

  const surfaced: ScoutSurfaced[] = [];
  const filtered: ScoutFiltered[] = [];

  const activeCommunities = new Set(
    input.profile.personal.communities.map((c) => c.name)
  );
  const productNames = input.profile.professional.products.map(
    (p) => p.product_name
  );
  const recentByCommunity =
    input.recent_replies_by_community ?? new Map<string, number>();

  for (const thread of input.threads) {
    const topic = inferTopicFromThread(thread);
    const match = findMatchingTier(topic, input.profile.professional.expertise_tiers);
    if (!match) continue;

    const expertise_fit = expertiseFitScore(match.level);
    const timing_score = computeTimingScore(
      {
        created_at: thread.created_at,
        upvotes_per_hour: thread.upvotes_per_hour,
        comments_per_hour: thread.comments_per_hour,
      },
      now
    );

    const antiContext: AntiSignalContext = {
      thread,
      active_communities: activeCommunities,
      recent_replies_by_community: recentByCommunity,
      product_names: productNames,
    };
    const antiFlags = collectAntiSignals(antiContext);
    const hardFlag = antiFlags.find((f) => f.hard) ?? null;

    const scoringInput = {
      expertise_fit,
      timing_score,
      citation_probability: 0,
      answer_gap_score: 0,
      anti_signal_count: antiFlags.length,
    };
    const provisionalScore = computeMatchScore(scoringInput);

    if (hardFlag) {
      filtered.push({
        thread,
        reason: hardFlag.reason,
        detail: hardFlag.detail,
        hypothetical_score: provisionalScore,
      });
      continue;
    }

    if (provisionalScore < minScore) continue;

    const breakdown = buildBreakdown(
      scoringInput,
      antiFlags.map((f) => f.reason)
    );
    const opportunityType: OpportunityType =
      match.level === "genuine_curiosity" ? "personal" : "professional";

    surfaced.push({
      thread,
      opportunity: {
        thread,
        match_score: provisionalScore,
        match_breakdown: breakdown,
        suggested_angle: null,
        expertise_tier_matched: match.level,
        opportunity_type: opportunityType,
        surfaced_at: new Date(now).toISOString(),
        expires_at: new Date(now + expirationHours * 60 * 60 * 1000).toISOString(),
        status: "pending",
      },
      anti_signal_flags: antiFlags,
    });
  }

  // Sort by provisional score so LLM enrichment hits the best candidates.
  surfaced.sort((a, b) => b.opportunity.match_score - a.opportunity.match_score);

  // LLM enrichment pass — top N only. Failures are silent.
  const enrichTargets = surfaced.slice(0, llmTopN);
  await Promise.all(
    enrichTargets.map(async (entry) => {
      const expertiseHit = {
        topic: entry.thread.title.toLowerCase().slice(0, 80),
        tier: entry.opportunity.expertise_tier_matched,
      };
      const gap = await analyzeAnswerGap(entry.thread, expertiseHit);
      const angle = await generateSuggestedAngle(
        entry.thread,
        expertiseHit,
        gap
      );

      // Re-score with the LLM-derived answer_gap_score (and the same
      // computational dimensions). Suggested angle is metadata only,
      // not part of the score.
      const enrichedScoring = {
        expertise_fit: entry.opportunity.match_breakdown.expertise_fit,
        timing_score: entry.opportunity.match_breakdown.timing_score,
        citation_probability: 0,
        answer_gap_score: gap?.score ?? 0,
        anti_signal_count: entry.anti_signal_flags.length,
      };
      const enrichedScore = computeMatchScore(enrichedScoring);
      const enrichedBreakdown = buildBreakdown(
        enrichedScoring,
        entry.anti_signal_flags.map((f) => f.reason)
      );

      entry.opportunity.match_score = enrichedScore;
      entry.opportunity.match_breakdown = enrichedBreakdown;
      entry.opportunity.suggested_angle = angle;
    })
  );

  // Re-sort after enrichment so a strong answer-gap can lift an
  // entry above its provisional ranking.
  surfaced.sort((a, b) => b.opportunity.match_score - a.opportunity.match_score);

  return {
    surfaced: surfaced.slice(0, limit),
    filtered,
  };
}

/**
 * Phase 2 topic inference is intentionally naive — just normalize the
 * thread title and let findMatchingTier do substring overlap. A full
 * embedding-similarity implementation lands once Mirror is producing
 * topic vectors at the operator level.
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
