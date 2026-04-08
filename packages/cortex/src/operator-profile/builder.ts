/**
 * Operator Profile dynamic construction.
 *
 * Profiles are NOT filled in via a form. They are built incrementally
 * from imports, content ingestion, and behavioral signals (Quality
 * Addendum #6 — Cold Start). This module provides the building blocks
 * Mirror calls during onboarding and ongoing learning.
 *
 * Phase 1 ships the type-safe builder + confidence math. Phase 2 wires
 * the actual import sources (Reddit history, Quora history, content
 * URLs). Phase 7 layers on dynamic tier assignment and behavioral
 * learning.
 */

import type {
  OperatorProfile,
  ProfessionalProfile,
  PersonalProfile,
  GateAdjustments,
} from "./types";

// Factory functions — each call returns a fresh instance with no shared
// references. We deliberately do NOT use module-level constants here
// because shallow spreading those would alias every nested array and
// object across every profile, letting one user's mutation bleed into
// another user's profile.

function freshProfessional(): ProfessionalProfile {
  return {
    expertise_tiers: [],
    products: [],
    writing_voice: {
      avg_sentence_length: null,
      vocabulary_level: null,
      tone_descriptors: [],
      signature_phrases: [],
    },
    platform_history: [],
  };
}

function freshPersonal(): PersonalProfile {
  return {
    interests: [],
    communities: [],
    engagement_style: {
      active_hours_local: [],
      reply_length_range: { min: 50, max: 300 },
      enable_personal_surfacing: true,
    },
  };
}

function freshGateAdjustments(): GateAdjustments {
  return {
    per_check_sensitivity: {},
    override_accuracy: 0.5,
    personal_removal_rate: 0,
    last_calibrated_at: new Date(0).toISOString(),
  };
}

/**
 * Build a fresh, empty Operator Profile. Mirror calls this on first
 * connection, then incrementally fills it in via import jobs.
 *
 * Every nested object/array is its own instance — mutating one profile
 * never affects another, even when many profiles are created in a single
 * process (background jobs, tests, server cold starts).
 */
export function newOperatorProfile(
  id: string,
  userId: string
): OperatorProfile {
  const now = new Date().toISOString();
  return {
    id,
    user_id: userId,
    professional: freshProfessional(),
    personal: freshPersonal(),
    gate_adjustments: freshGateAdjustments(),
    confidence: 0,
    created_at: now,
    last_updated: now,
  };
}

/**
 * Compute overall profile confidence from the populated fields.
 *
 * Targets per Quality Addendum #6.4 cold start trajectory:
 *   manual topics only       → 0.15
 *   + Reddit/Quora history   → 0.35
 *   + content URL ingestion  → 0.50
 *   + 10-thread calibration  → 0.60
 *   + first week of usage    → 0.75+
 */
export function computeProfileConfidence(
  profile: OperatorProfile
): number {
  let score = 0;

  // Expertise tiers — up to 0.30
  const tierCount = profile.professional.expertise_tiers.length;
  score += Math.min(0.3, tierCount * 0.05);

  // Voice fingerprint richness — up to 0.20
  const voice = profile.professional.writing_voice;
  if (voice.avg_sentence_length !== null) score += 0.05;
  if (voice.vocabulary_level !== null) score += 0.05;
  if (voice.tone_descriptors.length > 0) score += 0.05;
  if (voice.signature_phrases.length >= 3) score += 0.05;

  // Platform history — up to 0.20
  for (const ph of profile.professional.platform_history) {
    score += Math.min(0.1, (ph.post_count / 200) * 0.1);
  }

  // Personal — up to 0.15
  if (profile.personal.interests.length >= 3) score += 0.075;
  if (profile.personal.communities.length >= 2) score += 0.075;

  // Gate calibration — up to 0.15
  const adjustments = profile.gate_adjustments;
  const calibratedAt = Date.parse(adjustments.last_calibrated_at);
  if (calibratedAt > 0) {
    const ageDays = (Date.now() - calibratedAt) / 86400000;
    if (ageDays < 30) score += 0.15;
    else if (ageDays < 90) score += 0.075;
  }

  return Math.min(1, score);
}
