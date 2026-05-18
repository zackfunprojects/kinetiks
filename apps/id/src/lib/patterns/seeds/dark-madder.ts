/**
 * Placeholder Dark Madder pattern descriptors.
 *
 * Per the L1a/L1b plan, DM emission is not wired yet (DM is
 * mid-migration into the monorepo). The cross-registry validator
 * needs DM pattern types registered before any Operator that declares
 * `required_patterns: ["dark_madder.*"]` boots.
 *
 * L1b canonical shape: single-primary outcome per descriptor. The
 * L1a multi-outcome placeholders are split here:
 *
 *   L1a: dark_madder.content_resonance      (engagement_rate + conversion_rate)
 *   L1b: dark_madder.content_resonance.engagement_rate
 *        dark_madder.content_resonance.conversion_rate
 *
 *   L1a: dark_madder.audience_affinity      (completion_rate + share_rate)
 *   L1b: dark_madder.audience_affinity.completion_rate
 *        dark_madder.audience_affinity.share_rate
 *
 * All four are `customer_visible: false` in Phase 1: until DM is
 * emitting, showing the types in the Cortex Patterns sub-tab would be
 * noise. Flip to true when DM emission ships.
 */

import { z } from "zod";
import { definePatternType } from "@kinetiks/tools";

const CONTENT_FORMAT_ENUM = [
  "long_form_article",
  "short_form_article",
  "newsletter",
  "social_post",
  "video_script",
  "podcast_outline",
] as const;

const DISTRIBUTION_CHANNEL_ENUM = [
  "owned_blog",
  "linkedin",
  "twitter",
  "newsletter",
  "youtube",
  "podcast",
] as const;

const AUDIENCE_TIER_ENUM = ["cold", "warm", "engaged", "customer"] as const;

const contentResonanceSchema = z.object({
  topic_cluster: z.string(),
  content_format: z.enum(CONTENT_FORMAT_ENUM),
  distribution_channel: z.enum(DISTRIBUTION_CHANNEL_ENUM),
});

const audienceAffinitySchema = z.object({
  audience_tier: z.enum(AUDIENCE_TIER_ENUM),
  topic_cluster: z.string(),
  content_format: z.enum(CONTENT_FORMAT_ENUM),
});

const RESONANCE_FP = 20 * CONTENT_FORMAT_ENUM.length * DISTRIBUTION_CHANNEL_ENUM.length;
const AFFINITY_FP = AUDIENCE_TIER_ENUM.length * 20 * CONTENT_FORMAT_ENUM.length;

export const darkMadderContentResonanceEngagement = definePatternType({
  pattern_type: "dark_madder.content_resonance.engagement_rate",
  source_app: "dark_madder",
  description:
    "Content topic cluster x format x distribution channel mapped to engagement rate (engagements / impressions). Customer-visible flips on when DM emission ships.",
  read_apps: ["marcus", "oracle", "dark_madder"],
  customer_visible: false,
  dimensions_schema: contentResonanceSchema,
  fingerprint_dimensions: ["topic_cluster", "content_format", "distribution_channel"],
  outcome_metric: "engagement_rate",
  outcome_unit: "ratio_0_1",
  outcome_direction: "higher_is_better",
  decay_bounds: {
    initial_decay_days: 60,
    decay_floor_days: 30,
    decay_ceiling_days: 180,
    calibration_sample_threshold: 20,
  },
  confidence_thresholds: { validate_at: 0.65, decline_at: 0.35 },
  expected_max_fingerprints_per_account: RESONANCE_FP,
});

export const darkMadderContentResonanceConversion = definePatternType({
  pattern_type: "dark_madder.content_resonance.conversion_rate",
  source_app: "dark_madder",
  description:
    "Content topic cluster x format x distribution channel mapped to downstream conversion rate. Same fingerprint as the engagement variant; tracks deeper outcome.",
  read_apps: ["marcus", "oracle", "dark_madder"],
  customer_visible: false,
  dimensions_schema: contentResonanceSchema,
  fingerprint_dimensions: ["topic_cluster", "content_format", "distribution_channel"],
  outcome_metric: "conversion_rate",
  outcome_unit: "ratio_0_1",
  outcome_direction: "higher_is_better",
  decay_bounds: {
    initial_decay_days: 60,
    decay_floor_days: 30,
    decay_ceiling_days: 180,
    calibration_sample_threshold: 20,
  },
  confidence_thresholds: { validate_at: 0.65, decline_at: 0.35 },
  expected_max_fingerprints_per_account: RESONANCE_FP,
});

export const darkMadderAudienceAffinityCompletion = definePatternType({
  pattern_type: "dark_madder.audience_affinity.completion_rate",
  source_app: "dark_madder",
  description:
    "Audience tier x topic cluster x content format mapped to content completion rate (completions / starts).",
  read_apps: ["marcus", "oracle", "dark_madder"],
  customer_visible: false,
  dimensions_schema: audienceAffinitySchema,
  fingerprint_dimensions: ["audience_tier", "topic_cluster", "content_format"],
  outcome_metric: "completion_rate",
  outcome_unit: "ratio_0_1",
  outcome_direction: "higher_is_better",
  decay_bounds: {
    initial_decay_days: 60,
    decay_floor_days: 30,
    decay_ceiling_days: 180,
    calibration_sample_threshold: 20,
  },
  confidence_thresholds: { validate_at: 0.65, decline_at: 0.35 },
  expected_max_fingerprints_per_account: AFFINITY_FP,
});

export const darkMadderAudienceAffinityShare = definePatternType({
  pattern_type: "dark_madder.audience_affinity.share_rate",
  source_app: "dark_madder",
  description:
    "Audience tier x topic cluster x content format mapped to share rate (shares / impressions).",
  read_apps: ["marcus", "oracle", "dark_madder"],
  customer_visible: false,
  dimensions_schema: audienceAffinitySchema,
  fingerprint_dimensions: ["audience_tier", "topic_cluster", "content_format"],
  outcome_metric: "share_rate",
  outcome_unit: "ratio_0_1",
  outcome_direction: "higher_is_better",
  decay_bounds: {
    initial_decay_days: 60,
    decay_floor_days: 30,
    decay_ceiling_days: 180,
    calibration_sample_threshold: 20,
  },
  confidence_thresholds: { validate_at: 0.65, decline_at: 0.35 },
  expected_max_fingerprints_per_account: AFFINITY_FP,
});

export const darkMadderDescriptors = [
  darkMadderContentResonanceEngagement,
  darkMadderContentResonanceConversion,
  darkMadderAudienceAffinityCompletion,
  darkMadderAudienceAffinityShare,
] as const;
