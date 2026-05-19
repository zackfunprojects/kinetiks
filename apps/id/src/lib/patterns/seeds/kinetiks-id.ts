/**
 * Seed Pattern Type Descriptors for Kinetiks Core itself (apps/id), per
 * Phase 1.7 and the Kinetiks Contract Addendum §1.3.
 *
 * Even with no suite apps, Kinetiks Core observes meaningful customer
 * behavior and emits empirical signal about itself:
 *
 *   1. Which Marcus questions resonate (follow-up rate per topic/intent/ICP)
 *   2. Which Oracle insights drive action (action acceptance per category/severity)
 *   3. Which onboarding questions matter (context-structure-value delta per question)
 *   4. Which connections produce useful evidence (usefulness rate per provider/layer)
 *
 * Three of the four outcomes are DELAYED — the value isn't known at
 * observation time. The deferred-emit helper (apps/id/src/lib/patterns/
 * deferred-emit.ts) records the observation, waits for the outcome
 * window to close (or the outcome to arrive), and then emits via
 * /api/synapse/patterns with the canonical Synapse payload shape.
 *
 * All four declare source_app: "kinetiks_id" and route through the
 * standard arbitration path. Marcus and Oracle can read these (their
 * own behavior is evidence the system reasons over).
 */

import { z } from "zod";
import { definePatternType } from "@kinetiks/tools";

// ─────────────────────────────────────────────
// Bucketization helpers (pure functions)
// ─────────────────────────────────────────────

/** Coarse topic clusters for Marcus questions. */
export function bucketTopicCluster(raw: string): string {
  const v = String(raw ?? "").toLowerCase();
  if (/grow|growth|scale|expand|acquir/.test(v)) return "growth";
  if (/messag|positioning|narrative|tagline|copy/.test(v)) return "messaging";
  if (/metric|kpi|measure|track|analytics|funnel/.test(v)) return "metrics";
  if (/outbound|outreach|sequence|cold|email|prospect/.test(v)) return "outbound";
  if (/inbound|content|blog|seo|newsletter/.test(v)) return "content";
  if (/ad|ads|paid|google ads|meta ads|campaign/.test(v)) return "paid_media";
  if (/icp|persona|target|segment|customer/.test(v)) return "icp";
  if (/pricing|price|tier|package|monetiz/.test(v)) return "pricing";
  if (/ops|operations|hire|team|process/.test(v)) return "ops";
  return "other";
}

/** Coarse question intent buckets. */
export function bucketQuestionIntent(raw: string): string {
  const v = String(raw ?? "").toLowerCase();
  if (/recommend|suggest|should i|what should/.test(v)) return "recommendation_request";
  if (/run|do|execute|kick off|launch|send/.test(v)) return "action_request";
  if (/what|when|where|who|how many|how much|status/.test(v))
    return "information_seeking";
  if (/explore|brainstorm|ideas|think about|consider/.test(v)) return "exploratory";
  if (/clarify|mean|explain|what did you mean/.test(v)) return "clarification";
  return "other";
}

/** Coarse ICP segment buckets. */
export function bucketIcpSegment(raw: string): string {
  const v = String(raw ?? "").toLowerCase();
  if (/founder|ceo/.test(v) && /saas|software|tech/.test(v)) return "b2b_saas_founder";
  if (/founder|ceo/.test(v) && /commerce|retail|consumer/.test(v))
    return "dtc_founder";
  if (/marketing|cmo|head of marketing|vp marketing/.test(v))
    return "marketing_leader";
  if (/sales|cro|head of sales|vp sales/.test(v)) return "sales_leader";
  if (/product|head of product|vp product/.test(v)) return "product_leader";
  if (/operations|ops|coo/.test(v)) return "ops_leader";
  return "other_buyer";
}

/** Coarse urgency buckets for Oracle insight delivery. */
export function bucketUrgency(raw: string): string {
  const v = String(raw ?? "").toLowerCase();
  if (/immediate|now|today|urgent|asap/.test(v)) return "immediate";
  if (/this week|next 7|within a week/.test(v)) return "this_week";
  if (/this month|next 30|monthly/.test(v)) return "this_month";
  if (/quarter|later|whenever/.test(v)) return "later";
  return "later";
}

/** Coarse query class buckets for connection evidence. */
export function bucketQueryClass(raw: string): string {
  const v = String(raw ?? "").toLowerCase();
  if (/metric|kpi|measure|count|sum/.test(v)) return "metric_read";
  if (/structural|schema|metadata|inventory/.test(v)) return "structural_read";
  if (/trend|over time|history|series|growth/.test(v)) return "trend_read";
  if (/segment|breakdown|grouping/.test(v)) return "segment_read";
  return "other_read";
}

// ─────────────────────────────────────────────
// 1. Marcus question resonance
// ─────────────────────────────────────────────

const marcusResonanceSchema = z.object({
  topic_cluster: z.string(),
  question_intent: z.string(),
  icp_segment: z.string(),
});

function bucketMarcusResonance(raw: Record<string, unknown>) {
  return {
    topic_cluster: bucketTopicCluster(
      String(raw.topic ?? raw.topic_cluster ?? ""),
    ),
    question_intent: bucketQuestionIntent(
      String(raw.intent ?? raw.question_intent ?? ""),
    ),
    icp_segment: bucketIcpSegment(String(raw.icp ?? raw.icp_segment ?? "")),
  };
}

export const kinetiksIdMarcusQuestionResonance = definePatternType({
  pattern_type: "kinetiks_id.marcus_question_resonance",
  source_app: "kinetiks_id",
  description:
    "Marcus-question topic cluster × question intent × ICP segment mapped to follow-up turn rate. Outcome=1 if a new turn happens in the same thread within the configured window; 0 otherwise. Reveals which conversational threads earn ongoing engagement vs. one-shot Q&A.",
  read_apps: ["marcus", "oracle"],
  customer_visible: true,
  dimensions_schema: marcusResonanceSchema,
  fingerprint_dimensions: ["topic_cluster", "question_intent", "icp_segment"],
  bucketize: bucketMarcusResonance,
  outcome_metric: "follow_up_rate",
  outcome_unit: "ratio_0_1",
  outcome_direction: "higher_is_better",
  decay_bounds: {
    initial_decay_days: 45,
    decay_floor_days: 21,
    decay_ceiling_days: 150,
    calibration_sample_threshold: 20,
  },
  confidence_thresholds: { validate_at: 0.6, decline_at: 0.3 },
  expected_max_fingerprints_per_account: 10 * 6 * 7, // 420
});

// ─────────────────────────────────────────────
// 2. Oracle insight action rate
// ─────────────────────────────────────────────

const INSIGHT_CATEGORIES = [
  "metric_anomaly",
  "opportunity",
  "risk",
  "recommendation",
  "summary",
] as const;

const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;

const insightActionSchema = z.object({
  insight_category: z.enum(INSIGHT_CATEGORIES),
  severity: z.enum(SEVERITIES),
  urgency_bucket: z.string(),
});

function bucketInsightAction(raw: Record<string, unknown>) {
  return {
    insight_category: raw.insight_category as (typeof INSIGHT_CATEGORIES)[number],
    severity: raw.severity as (typeof SEVERITIES)[number],
    urgency_bucket: bucketUrgency(String(raw.urgency ?? raw.urgency_bucket ?? "")),
  };
}

export const kinetiksIdInsightActionRate = definePatternType({
  pattern_type: "kinetiks_id.insight_action_rate",
  source_app: "kinetiks_id",
  description:
    "Oracle insight category × severity × urgency bucket mapped to action acceptance rate. Outcome=1 when the customer accepts the suggested action; 0 when rejected or the response window expires. Reveals which insight shapes the customer actually acts on.",
  read_apps: ["marcus", "oracle"],
  customer_visible: true,
  dimensions_schema: insightActionSchema,
  fingerprint_dimensions: ["insight_category", "severity", "urgency_bucket"],
  bucketize: bucketInsightAction,
  outcome_metric: "action_acceptance_rate",
  outcome_unit: "ratio_0_1",
  outcome_direction: "higher_is_better",
  decay_bounds: {
    initial_decay_days: 60,
    decay_floor_days: 30,
    decay_ceiling_days: 180,
    calibration_sample_threshold: 15,
  },
  confidence_thresholds: { validate_at: 0.6, decline_at: 0.3 },
  expected_max_fingerprints_per_account:
    INSIGHT_CATEGORIES.length * SEVERITIES.length * 4, // 100
});

// ─────────────────────────────────────────────
// 3. Onboarding question value (synchronous outcome)
// ─────────────────────────────────────────────

const onboardingQuestionSchema = z.object({
  question_id: z.string().min(1).max(120),
  icp_segment: z.string(),
});

function bucketOnboardingQuestion(raw: Record<string, unknown>) {
  return {
    question_id: String(raw.question_id ?? ""),
    icp_segment: bucketIcpSegment(String(raw.icp ?? raw.icp_segment ?? "")),
  };
}

export const kinetiksIdOnboardingQuestionValue = definePatternType({
  pattern_type: "kinetiks_id.onboarding_question_value",
  source_app: "kinetiks_id",
  description:
    "Onboarding question id × ICP segment mapped to context-structure-value delta (z-score of the structural improvement the answer produced). Reveals which onboarding questions actually move the Cortex needle for which buyer types — used to prune low-value questions and prioritize high-value ones.",
  read_apps: ["marcus", "oracle"],
  customer_visible: true,
  dimensions_schema: onboardingQuestionSchema,
  fingerprint_dimensions: ["question_id", "icp_segment"],
  bucketize: bucketOnboardingQuestion,
  outcome_metric: "context_value_delta_z",
  outcome_unit: "z_score",
  outcome_direction: "higher_is_better",
  decay_bounds: {
    // Onboarding signal is rare and long-lived. Longer decay than the
    // other Kinetiks-internal types.
    initial_decay_days: 180,
    decay_floor_days: 90,
    decay_ceiling_days: 540,
    calibration_sample_threshold: 10,
  },
  confidence_thresholds: { validate_at: 0.55, decline_at: 0.25 },
  // Bounded by the number of distinct onboarding question ids × ICP segments.
  // Question ids are stable, finite. ~30 questions × 7 segments = 210.
  expected_max_fingerprints_per_account: 210,
});

// ─────────────────────────────────────────────
// 4. Connection value per source
// ─────────────────────────────────────────────

const CONNECTION_PROVIDERS = [
  "ga4",
  "gsc",
  "stripe",
  "google_ads",
  "meta_ads",
  "hubspot",
  "gmail",
  "microsoft_365",
  "slack",
  "other",
] as const;

const CONTEXT_LAYERS = [
  "org",
  "products",
  "voice",
  "customers",
  "narrative",
  "competitive",
  "market",
  "brand",
  "none",
] as const;

const connectionValueSchema = z.object({
  provider: z.enum(CONNECTION_PROVIDERS),
  layer_touched: z.enum(CONTEXT_LAYERS),
  query_class: z.string(),
});

function bucketConnectionValue(raw: Record<string, unknown>) {
  const provider = String(raw.provider ?? "other");
  const safeProvider = (
    CONNECTION_PROVIDERS as ReadonlyArray<string>
  ).includes(provider)
    ? (provider as (typeof CONNECTION_PROVIDERS)[number])
    : "other";
  const layer = String(raw.layer ?? raw.layer_touched ?? "none");
  const safeLayer = (CONTEXT_LAYERS as ReadonlyArray<string>).includes(layer)
    ? (layer as (typeof CONTEXT_LAYERS)[number])
    : "none";
  return {
    provider: safeProvider,
    layer_touched: safeLayer,
    query_class: bucketQueryClass(String(raw.query_class ?? raw.query ?? "")),
  };
}

export const kinetiksIdConnectionValuePerSource = definePatternType({
  pattern_type: "kinetiks_id.connection_value_per_source",
  source_app: "kinetiks_id",
  description:
    "Connection provider × context layer × query class mapped to evidence-usefulness rate. Outcome=1 when downstream Marcus/Oracle reasoning actually consumed evidence drawn from this connection in the observed window; 0 otherwise. Reveals which integrations are pulling weight vs. sitting idle. NOTE: usefulness signal lands in a follow-up; v1 stubs the outcome and the cron sweep emits with outcome=0 until the signal exists.",
  read_apps: ["marcus", "oracle"],
  customer_visible: true,
  dimensions_schema: connectionValueSchema,
  fingerprint_dimensions: ["provider", "layer_touched", "query_class"],
  bucketize: bucketConnectionValue,
  outcome_metric: "evidence_usefulness_rate",
  outcome_unit: "ratio_0_1",
  outcome_direction: "higher_is_better",
  decay_bounds: {
    initial_decay_days: 90,
    decay_floor_days: 45,
    decay_ceiling_days: 270,
    calibration_sample_threshold: 15,
  },
  confidence_thresholds: { validate_at: 0.55, decline_at: 0.25 },
  expected_max_fingerprints_per_account:
    CONNECTION_PROVIDERS.length * CONTEXT_LAYERS.length * 5, // 450
});

export const kinetiksIdDescriptors = [
  kinetiksIdMarcusQuestionResonance,
  kinetiksIdInsightActionRate,
  kinetiksIdOnboardingQuestionValue,
  kinetiksIdConnectionValuePerSource,
] as const;
