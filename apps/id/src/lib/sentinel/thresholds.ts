import type { SentinelContentType } from "@kinetiks/types";

/**
 * Quality threshold configuration per content type.
 *
 * approve_threshold: quality score >= this -> approved
 * flag_floor: quality score between floor and threshold -> flagged
 * Below flag_floor -> held
 */
interface QualityThreshold {
  approve_threshold: number;
  flag_floor: number;
}

const DEFAULT_THRESHOLDS: Record<SentinelContentType, QualityThreshold> = {
  // Harvest - highest scrutiny for cold outreach
  cold_email: { approve_threshold: 80, flag_floor: 50 },
  follow_up_email: { approve_threshold: 70, flag_floor: 50 },
  linkedin_connect: { approve_threshold: 70, flag_floor: 50 },
  linkedin_dm: { approve_threshold: 65, flag_floor: 45 },
  voice_call_script: { approve_threshold: 85, flag_floor: 55 },
  voicemail_script: { approve_threshold: 75, flag_floor: 50 },
  auto_reply: { approve_threshold: 75, flag_floor: 50 },
  meeting_message: { approve_threshold: 60, flag_floor: 40 },

  // Dark Madder - content quality
  blog_post: { approve_threshold: 75, flag_floor: 50 },
  social_post: { approve_threshold: 65, flag_floor: 45 },
  newsletter: { approve_threshold: 70, flag_floor: 50 },
  seo_content: { approve_threshold: 70, flag_floor: 45 },

  // Hypothesis - landing pages
  landing_page: { approve_threshold: 75, flag_floor: 50 },
  personalized_page: { approve_threshold: 75, flag_floor: 50 },
  ab_variant: { approve_threshold: 70, flag_floor: 45 },

  // Litmus - highest bar for press materials
  press_release: { approve_threshold: 90, flag_floor: 60 },
  journalist_pitch: { approve_threshold: 85, flag_floor: 55 },
  media_response: { approve_threshold: 85, flag_floor: 55 },
};

/**
 * Default fatigue limits.
 */
export const DEFAULT_FATIGUE_LIMITS = {
  max_contact_touchpoints_7d: 5,
  max_contact_touchpoints_24h: 2,
  max_org_touchpoints_7d: 8,
  min_gap_hours: 24,
  negative_cooldown_days: 14,
  unsubscribe_other_channel_pause_days: 30,
  max_consecutive_no_response: 6,
} as const;

/**
 * Engagement-adaptive multipliers.
 */
export const ENGAGEMENT_MULTIPLIERS: Record<string, number> = {
  high: 1.5,
  normal: 1.0,
  low: 0.5,
  negative: 0,
};

/**
 * Get the quality threshold for a content type.
 * In the future this will support per-account overrides from the DB.
 */
export function getThreshold(contentType: SentinelContentType): QualityThreshold {
  return DEFAULT_THRESHOLDS[contentType] ?? { approve_threshold: 70, flag_floor: 50 };
}

/**
 * Determine verdict from quality score and thresholds.
 */
export function scoreToVerdict(
  score: number,
  contentType: SentinelContentType
): "approved" | "flagged" | "held" {
  const threshold = getThreshold(contentType);
  if (score >= threshold.approve_threshold) return "approved";
  if (score >= threshold.flag_floor) return "flagged";
  return "held";
}

/**
 * Length ranges per content type (in words).
 */
export const LENGTH_RANGES: Record<string, { min: number; max: number }> = {
  cold_email: { min: 40, max: 150 },
  follow_up_email: { min: 30, max: 120 },
  linkedin_connect: { min: 10, max: 60 },
  linkedin_dm: { min: 20, max: 150 },
  voice_call_script: { min: 100, max: 500 },
  voicemail_script: { min: 30, max: 100 },
  auto_reply: { min: 30, max: 200 },
  meeting_message: { min: 15, max: 80 },
  blog_post: { min: 500, max: 5000 },
  social_post: { min: 10, max: 280 },
  newsletter: { min: 200, max: 2000 },
  seo_content: { min: 500, max: 5000 },
  landing_page: { min: 100, max: 1500 },
  personalized_page: { min: 100, max: 1500 },
  ab_variant: { min: 50, max: 1500 },
  press_release: { min: 300, max: 1500 },
  journalist_pitch: { min: 100, max: 400 },
  media_response: { min: 50, max: 500 },
};
