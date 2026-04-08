/**
 * Operator Profile — the new Cortex primitive introduced by DeskOf.
 *
 * Unlike the 8 business context layers, the Operator Profile models
 * the human operator behind the business: their professional expertise
 * tiers, personal interests, writing voice, behavioral patterns, and
 * gate calibration adjustments.
 *
 * DeskOf is the first consumer. Future Kinetiks apps (notably the
 * planned social/thought leadership tool) will consume the same profile.
 *
 * Privacy invariants (CLAUDE.md §11):
 * - Never shared with other users
 * - Never used to train models that serve other users
 * - Lives in Cortex, not in any single app
 * - Deleted within 7 days of account deletion
 */

export type ExpertiseTierLevel =
  | "core_authority"
  | "credible_adjacency"
  | "genuine_curiosity";

export interface ExpertiseTier {
  topic: string;
  tier: ExpertiseTierLevel;
  /** Free-text evidence — content URLs, post IDs, calibration answers */
  evidence: string[];
  /** 0-1 confidence Mirror has in this assignment */
  confidence: number;
}

export interface ProductAssociation {
  product_name: string;
  /** How directly the operator works on this product */
  association: "founder" | "operator" | "advisor" | "user" | "fan";
}

export interface VoiceFingerprint {
  /** Average sentence length in words */
  avg_sentence_length: number | null;
  /** Vocabulary level: simple / mixed / technical */
  vocabulary_level: "simple" | "mixed" | "technical" | null;
  /** Tone descriptors extracted from samples */
  tone_descriptors: string[];
  /** Distinctive phrases the operator uses repeatedly */
  signature_phrases: string[];
}

export interface PlatformHistory {
  platform: "reddit" | "quora" | "linkedin" | "twitter" | "blog";
  account_handle: string;
  /** Distinct subreddits/spaces/topics the operator has posted in */
  community_count: number;
  /** Total posts imported */
  post_count: number;
  imported_at: string;
}

export interface Interest {
  topic: string;
  /** Where this interest came from */
  source: "manual" | "history_import" | "behavioral";
  confidence: number;
}

export interface Community {
  platform: "reddit" | "quora";
  name: string;
  /** Operator's posting frequency in this community */
  cadence: "daily" | "weekly" | "monthly" | "rare";
}

export interface EngagementPrefs {
  /** Hours of day the operator typically engages */
  active_hours_local: number[];
  /** Comfortable reply length range in words */
  reply_length_range: { min: number; max: number };
  /** Whether to surface personal-interest threads alongside professional */
  enable_personal_surfacing: boolean;
}

/**
 * Per-user calibration adjustments for the quality gate.
 * Mirror updates these from override accuracy and post-gate removal data.
 */
export interface GateAdjustments {
  /** Multiplier on advisory threshold per check (1.0 = default) */
  per_check_sensitivity: Record<string, number>;
  /** Override accuracy: did past overrides survive moderation? 0-1 */
  override_accuracy: number;
  /** Post-gate removal rate for this specific user, 0-1 */
  personal_removal_rate: number;
  last_calibrated_at: string;
}

export interface ProfessionalProfile {
  expertise_tiers: ExpertiseTier[];
  products: ProductAssociation[];
  writing_voice: VoiceFingerprint;
  platform_history: PlatformHistory[];
}

export interface PersonalProfile {
  interests: Interest[];
  communities: Community[];
  engagement_style: EngagementPrefs;
}

export interface OperatorProfile {
  id: string;
  /** Kinetiks user this profile belongs to */
  user_id: string;
  professional: ProfessionalProfile;
  personal: PersonalProfile;
  gate_adjustments: GateAdjustments;
  /** 0-1 confidence the system has in this profile overall */
  confidence: number;
  created_at: string;
  last_updated: string;
}
