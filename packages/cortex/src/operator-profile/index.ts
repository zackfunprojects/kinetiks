/**
 * Operator Profile — Cortex primitive for modeling the human operator.
 * First consumer: DeskOf. Future consumers: any Kinetiks app that needs
 * to reason about who is speaking, not just what business they run.
 */
export type {
  OperatorProfile,
  ProfessionalProfile,
  PersonalProfile,
  ExpertiseTier,
  ExpertiseTierLevel,
  ProductAssociation,
  VoiceFingerprint,
  PlatformHistory,
  Interest,
  Community,
  EngagementPrefs,
  GateAdjustments,
} from "./types";

export {
  findMatchingTier,
  expertiseTierWeight,
} from "./expertise-tiers";

export {
  newOperatorProfile,
  computeProfileConfidence,
} from "./builder";
