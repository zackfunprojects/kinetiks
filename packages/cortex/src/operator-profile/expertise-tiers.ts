/**
 * Expertise tier classification logic.
 *
 * The three tiers are NOT a 1-2-3 ordering. They are categorically
 * different ways the operator can show up in a thread:
 *
 *   core_authority      — operator is a recognized expert. They wrote
 *                         the canonical guide on this. Their reply
 *                         changes how the thread is read.
 *
 *   credible_adjacency  — operator has real, demonstrable experience
 *                         that touches the question without being the
 *                         center of their expertise. They can add a
 *                         different angle.
 *
 *   genuine_curiosity   — the operator is interested in this topic
 *                         personally, has been engaging in the community,
 *                         and can ask the questions that move the thread
 *                         forward — even if they aren't the expert.
 */

import type { ExpertiseTier, ExpertiseTierLevel } from "./types";

/**
 * Returns true if the user with the given expertise can credibly
 * engage in a thread about the given topic, and at which tier.
 *
 * Topic-tier matching uses lowercased substring overlap by default.
 * Phase 4 will replace this with a vector similarity comparison once
 * Mirror is producing topic embeddings.
 */
export function findMatchingTier(
  topic: string,
  tiers: ExpertiseTier[]
): { tier: ExpertiseTier; level: ExpertiseTierLevel } | null {
  const normalizedTopic = topic.toLowerCase();

  // Prefer the strongest tier that matches
  const order: ExpertiseTierLevel[] = [
    "core_authority",
    "credible_adjacency",
    "genuine_curiosity",
  ];

  for (const level of order) {
    const candidates = tiers.filter((t) => t.tier === level);
    for (const tier of candidates) {
      if (topicMatches(tier.topic, normalizedTopic)) {
        return { tier, level };
      }
    }
  }

  return null;
}

function topicMatches(tierTopic: string, threadTopic: string): boolean {
  const normalizedTier = tierTopic.toLowerCase();
  return (
    threadTopic.includes(normalizedTier) ||
    normalizedTier.includes(threadTopic)
  );
}

/**
 * Confidence weight applied to the expertise_fit dimension of the
 * composite scoring model based on the matched tier. Core authority
 * weighs heaviest, genuine curiosity lightest, but none are zero —
 * even a curious operator can add value to a thread.
 */
export function expertiseTierWeight(level: ExpertiseTierLevel): number {
  switch (level) {
    case "core_authority":
      return 1.0;
    case "credible_adjacency":
      return 0.7;
    case "genuine_curiosity":
      return 0.4;
  }
}
