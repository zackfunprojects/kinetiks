import type { ConfidenceInputs, ConfidenceResult, ConfidenceBreakdown } from "./types";

const WEIGHTS = {
  cortex: 0.4,
  category: 0.3,
  specificity: 0.2,
  agent: 0.1,
};

/**
 * Calculate confidence score for an approval action.
 * Pure function - deterministic given the same inputs.
 *
 * Weights: Cortex 40%, Category history 30%, Action specificity 20%, Agent 10%
 */
export function calculateConfidence(inputs: ConfidenceInputs): ConfidenceResult {
  const cortexScore = clamp(inputs.cortex_confidence, 0, 100);
  const categoryScore = calculateCategoryScore(inputs.category_history);
  const specificityScore = clamp(inputs.action_specificity, 0, 100);
  const agentScore = clamp(inputs.agent_confidence, 0, 100);

  const breakdown: ConfidenceBreakdown = {
    cortex: round(cortexScore * WEIGHTS.cortex),
    category: round(categoryScore * WEIGHTS.category),
    specificity: round(specificityScore * WEIGHTS.specificity),
    agent: round(agentScore * WEIGHTS.agent),
  };

  const score = round(
    breakdown.cortex + breakdown.category + breakdown.specificity + breakdown.agent
  );

  return {
    score,
    breakdown,
    auto_approve: false, // Determined by threshold check, not here
    reason: buildReason(score, breakdown, inputs),
  };
}

/**
 * Calculate the category history component (0-100).
 *
 * New categories default to 30.
 * Recent rejections (within 7 days) apply heavy penalty.
 * High edit rates (>50%) cap at 50% of max.
 */
function calculateCategoryScore(history: ConfidenceInputs["category_history"]): number {
  // New category with no history
  if (history.approval_count === 0) {
    return 30;
  }

  let score = history.approval_rate; // Start with approval rate (0-100)

  // Small sample discount: blend toward default (30) for < 5 approvals
  if (history.approval_count < 5) {
    const sampleWeight = history.approval_count / 5;
    score = score * sampleWeight + 30 * (1 - sampleWeight);
  }

  // High edit rate penalty: cap at 50 if edit rate > 50%
  if (history.edit_rate > 50) {
    score = Math.min(score, 50);
  }

  // Recent rejection penalty
  if (history.last_rejection_at) {
    const daysSinceRejection = daysSince(history.last_rejection_at);

    if (daysSinceRejection <= 1) {
      // Very recent - heavy penalty
      score *= 0.3;
    } else if (daysSinceRejection <= 3) {
      score *= 0.5;
    } else if (daysSinceRejection <= 7) {
      score *= 0.7;
    }
    // Beyond 7 days: no penalty from rejection timing
  }

  // Consecutive clean approvals bonus (max +10)
  const consecutiveBonus = Math.min(history.consecutive_clean * 0.5, 10);
  score = Math.min(score + consecutiveBonus, 100);

  return clamp(score, 0, 100);
}

function buildReason(
  score: number,
  breakdown: ConfidenceBreakdown,
  inputs: ConfidenceInputs
): string {
  const parts: string[] = [];

  if (score >= 80) {
    parts.push("High confidence");
  } else if (score >= 60) {
    parts.push("Moderate confidence");
  } else if (score >= 40) {
    parts.push("Low confidence");
  } else {
    parts.push("Very low confidence");
  }

  // Note the weakest signal
  const min = Math.min(
    inputs.cortex_confidence,
    inputs.category_history.approval_count > 0 ? inputs.category_history.approval_rate : 30,
    inputs.action_specificity,
    inputs.agent_confidence
  );

  if (min === inputs.cortex_confidence && inputs.cortex_confidence < 50) {
    parts.push("business identity still being learned");
  } else if (inputs.category_history.approval_count === 0) {
    parts.push("no history for this action type");
  } else if (inputs.category_history.last_rejection_at && daysSince(inputs.category_history.last_rejection_at) <= 7) {
    parts.push("recent rejection in this category");
  }

  return parts.join(" - ");
}

function daysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  return (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
