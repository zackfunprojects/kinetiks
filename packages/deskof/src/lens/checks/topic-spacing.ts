/**
 * Topic spacing check (Quality Addendum #5).
 *
 * Vectorizes the current draft via the lightweight bag-of-bigrams in
 * ../vectorize.ts and computes cosine similarity against every
 * stored vector from the user's last 7 days. Counts how many were
 * "similar enough" (≥ 0.6) and applies the spec mapping:
 *
 *   0-1 similar             → silent (no row)
 *   2 similar               → informational
 *   3+ similar              → advisory
 *   same-day-different-community → elevated advisory
 *
 * The "elevated advisory" case is what the spec calls the topic-
 * dumping antipattern: posting essentially the same answer to two
 * different communities on the same day.
 */

import type { GateCheck } from "../../types/gate";
import type { LensInput } from "../types";
import { cosineSimilarity, vectorize } from "../vectorize";

const SIMILARITY_THRESHOLD = 0.6;

export function checkTopicSpacing(input: LensInput): GateCheck | null {
  if (input.recentVectors.length === 0) return null;

  const draftVec = vectorize(input.content).vector;
  if (draftVec.every((v) => v === 0)) return null;

  const today = isoDay(new Date().toISOString());
  let similarCount = 0;
  let sameDayDifferentCommunity = false;

  for (const past of input.recentVectors) {
    const sim = cosineSimilarity(draftVec, past.vector);
    if (sim < SIMILARITY_THRESHOLD) continue;
    similarCount += 1;

    if (
      isoDay(past.posted_at) === today &&
      past.community != null &&
      input.community != null &&
      past.community !== input.community
    ) {
      sameDayDifferentCommunity = true;
    }
  }

  if (sameDayDifferentCommunity) {
    return {
      type: "topic_spacing",
      passed: false,
      severity: "warning",
      message:
        "You already posted a very similar reply in a different community today.",
      recommendation:
        "Wait at least a day or rewrite this in a way that's tailored to the new community. Cross-community topic dumping is a removal trigger.",
    };
  }
  if (similarCount >= 3) {
    return {
      type: "topic_spacing",
      passed: false,
      severity: "warning",
      message: `You've posted ${similarCount} similar replies in the last 7 days.`,
      recommendation:
        "Consider varying the angle or waiting a few days. Repeating yourself depresses citation probability.",
    };
  }
  if (similarCount === 2) {
    return {
      type: "topic_spacing",
      passed: true,
      severity: "info",
      message: "You've posted 2 similar replies recently.",
      recommendation: "",
    };
  }
  return null;
}

function isoDay(timestamp: string): string {
  return timestamp.slice(0, 10);
}
