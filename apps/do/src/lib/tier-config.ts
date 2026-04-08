/**
 * DeskOf tier configuration — single source of truth.
 *
 * Quality Addendum #10.4 defines the complete feature gating matrix
 * across Free / Standard / Hero. This file encodes that matrix in one
 * place. Components NEVER hard-code tier checks. They use:
 *
 *   - canAccess(feature, tier)         in route handlers / server code
 *   - <UpgradeGate feature="..." />    in UI to show locked states
 *
 * Any new gated capability MUST be added here first. CodeRabbit will
 * flag direct tier comparisons in component code as a violation.
 */

import type { BillingTier } from "@kinetiks/deskof";
import { TIER_CONTENT_URL_LIMITS } from "@kinetiks/deskof";

/**
 * Every gated feature in DeskOf. The string literal type is exhaustive —
 * adding a new feature requires updating both the union and the matrix.
 */
export type Feature =
  // Discovery engine
  | "platform_quora"
  | "scoring_full_composite"
  | "scoring_custom_weights"
  | "suggested_angles"
  | "anti_signal_full"
  | "filtered_feed_full"
  | "filtered_feed_digest"
  | "personal_interest_surfacing"
  | "competitive_topic_density"
  // Quality gate
  | "gate_tone_match"
  | "gate_redundancy"
  | "gate_question_responsiveness"
  | "gate_cppi"
  | "gate_topic_spacing"
  // Write tab
  | "write_answer_gap_callout"
  // Reply tab
  | "reply_full_thread_list"
  | "reply_triage_intelligence"
  | "reply_sentiment_analysis"
  | "reply_learnings_panel"
  | "reply_removed_analysis_full"
  // Reputation tab
  | "reputation_trend_chart"
  | "reputation_dimensions_drill"
  | "reputation_citation_feed_full"
  | "reputation_citation_feed_priority"
  | "reputation_platform_health_full"
  | "reputation_streaks"
  | "reputation_gsc_correlation"
  | "reputation_exportable_analytics"
  // Operator Profile / Mirror
  | "profile_quora_history"
  | "profile_content_url_ingestion"
  | "profile_content_url_unlimited"
  | "profile_calibration_exercise"
  | "profile_dynamic_tier_assignment"
  | "profile_full_behavioral_learning"
  // MCP / agent
  | "mcp_read_tools"
  | "mcp_write_tools"
  | "approvals_mode"
  | "autopilot_mode"
  | "custom_notifications"
  | "webhook_events"
  // Hero strategic
  | "weekly_strategy_brief";

/** Numeric ordering used for "at least this tier" comparisons. */
const TIER_RANK: Record<BillingTier, number> = {
  free: 0,
  standard: 1,
  hero: 2,
};

/**
 * Minimum tier required for each feature. The matrix below is the
 * literal Quality Addendum #10.4 table encoded in code.
 */
const FEATURE_MIN_TIER: Record<Feature, BillingTier> = {
  // Discovery engine
  platform_quora: "standard",
  scoring_full_composite: "standard",
  scoring_custom_weights: "hero",
  suggested_angles: "standard",
  anti_signal_full: "standard",
  filtered_feed_full: "standard",
  filtered_feed_digest: "hero",
  personal_interest_surfacing: "standard",
  competitive_topic_density: "hero",
  // Quality gate
  gate_tone_match: "standard",
  gate_redundancy: "standard",
  gate_question_responsiveness: "standard",
  gate_cppi: "standard",
  gate_topic_spacing: "standard",
  // Write tab
  write_answer_gap_callout: "standard",
  // Reply tab
  reply_full_thread_list: "standard",
  reply_triage_intelligence: "standard",
  reply_sentiment_analysis: "standard",
  reply_learnings_panel: "standard",
  reply_removed_analysis_full: "standard",
  // Reputation tab
  reputation_trend_chart: "standard",
  reputation_dimensions_drill: "standard",
  reputation_citation_feed_full: "standard",
  reputation_citation_feed_priority: "hero",
  reputation_platform_health_full: "standard",
  reputation_streaks: "standard",
  reputation_gsc_correlation: "hero",
  reputation_exportable_analytics: "hero",
  // Operator Profile / Mirror
  profile_quora_history: "standard",
  profile_content_url_ingestion: "standard",
  profile_content_url_unlimited: "hero",
  profile_calibration_exercise: "standard",
  profile_dynamic_tier_assignment: "standard",
  profile_full_behavioral_learning: "standard",
  // MCP / agent
  mcp_read_tools: "standard",
  mcp_write_tools: "hero",
  approvals_mode: "standard",
  autopilot_mode: "hero",
  custom_notifications: "hero",
  webhook_events: "hero",
  // Hero strategic
  weekly_strategy_brief: "hero",
};

/**
 * Quantitative limits per tier (where the gate is a quota, not a binary).
 * Used by code paths like content URL ingestion that should hard-cap.
 *
 * The underlying numbers live in @kinetiks/deskof so server-side
 * services and the UI gate matrix share one source of truth.
 */
export const TIER_LIMITS = {
  content_urls: TIER_CONTENT_URL_LIMITS,
} as const;

/**
 * Returns true if the user's tier allows access to the feature.
 */
export function canAccess(feature: Feature, tier: BillingTier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[FEATURE_MIN_TIER[feature]];
}

/**
 * Returns the minimum tier required for the feature. Used by upgrade
 * CTAs to show "Upgrade to Standard" vs "Upgrade to Hero".
 */
export function requiredTier(feature: Feature): BillingTier {
  return FEATURE_MIN_TIER[feature];
}

/**
 * Test helper / introspection: every gated feature in the system. Useful
 * for building the upgrade page table and for completeness tests.
 */
export function allFeatures(): Feature[] {
  return Object.keys(FEATURE_MIN_TIER) as Feature[];
}
