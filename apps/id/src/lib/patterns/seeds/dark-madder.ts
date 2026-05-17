/**
 * Placeholder Dark Madder pattern descriptors.
 *
 * Per the L1a plan, DM emission is not wired in Phase 1 (DM is
 * mid-migration into the monorepo). But the cross-registry validator
 * needs DM pattern types registered before any Operator that declares
 * `required_patterns: ["dark_madder.*"]` boots, AND we want the
 * registry to be forward-compatible.
 *
 * Both placeholders are `customer_visible: false` in Phase 1: until DM
 * is emitting, showing the types in the Cortex Patterns sub-tab would
 * be noise. Flip to true when DM emission ships.
 *
 * When the DM monorepo migration completes, move this file to
 * apps/dm/src/lib/patterns/.
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

export const darkMadderContentResonance = definePatternType({
  pattern_type: "dark_madder.content_resonance",
  description:
    "Dark Madder content topic x format x distribution channel signature, mapped to engagement and conversion rates. Customer-visible flips on when DM emission ships.",
  emitting_apps: ["dark_madder"],
  read_apps: ["marcus", "oracle", "dark_madder"],
  customer_visible: false,
  dimensions_schema: z.object({
    topic_cluster: z.string(),
    content_format: z.enum(CONTENT_FORMAT_ENUM),
    distribution_channel: z.enum(DISTRIBUTION_CHANNEL_ENUM),
  }),
  fingerprint_dimensions: ["topic_cluster", "content_format", "distribution_channel"],
  // No bucketize here in Phase 1; the topic_cluster source is expected
  // to already be a coarse cluster id when DM ships.
  valid_outcome_metrics: [
    { name: "engagement_rate", description: "Engagements / impressions ratio.", unit: "ratio_0_1" },
    {
      name: "conversion_rate",
      description: "Downstream conversions / impressions ratio.",
      unit: "ratio_0_1",
    },
  ],
  decay_bounds: {
    initial_decay_days: 60,
    decay_floor_days: 30,
    decay_ceiling_days: 180,
    calibration_sample_threshold: 20,
  },
  confidence_thresholds: { validate_at: 0.65, decline_at: 0.35 },
  // 20 topic clusters × format × channel = 720
  expected_max_fingerprints_per_account:
    20 * CONTENT_FORMAT_ENUM.length * DISTRIBUTION_CHANNEL_ENUM.length,
});

export const darkMadderAudienceAffinity = definePatternType({
  pattern_type: "dark_madder.audience_affinity",
  description:
    "Audience tier (cold / warm / engaged / customer) x content topic cluster x format. Maps to retention and shareability metrics. Customer-visible flips on when DM emission ships.",
  emitting_apps: ["dark_madder"],
  read_apps: ["marcus", "oracle", "dark_madder"],
  customer_visible: false,
  dimensions_schema: z.object({
    audience_tier: z.enum(AUDIENCE_TIER_ENUM),
    topic_cluster: z.string(),
    content_format: z.enum(CONTENT_FORMAT_ENUM),
  }),
  fingerprint_dimensions: ["audience_tier", "topic_cluster", "content_format"],
  valid_outcome_metrics: [
    { name: "completion_rate", description: "Content completions / starts ratio.", unit: "ratio_0_1" },
    { name: "share_rate", description: "Shares / impressions ratio.", unit: "ratio_0_1" },
  ],
  decay_bounds: {
    initial_decay_days: 60,
    decay_floor_days: 30,
    decay_ceiling_days: 180,
    calibration_sample_threshold: 20,
  },
  confidence_thresholds: { validate_at: 0.65, decline_at: 0.35 },
  expected_max_fingerprints_per_account:
    AUDIENCE_TIER_ENUM.length * 20 * CONTENT_FORMAT_ENUM.length,
});

export const darkMadderDescriptors = [
  darkMadderContentResonance,
  darkMadderAudienceAffinity,
] as const;
