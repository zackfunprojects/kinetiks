/**
 * @kinetiks/cortex — shared Cortex primitives.
 *
 * Cortex is the intelligence layer that evaluates proposals from Synapse,
 * detects conflicts, computes confidence per context layer, and routes
 * learning events to other Kinetiks apps.
 *
 * This package is consumed by:
 *   - apps/id   (the original Cortex host)
 *   - apps/do   (DeskOf — first consumer of the Operator Profile primitive)
 *   - any future Kinetiks app that needs Cortex
 */

// Core pipeline
export { evaluateProposal } from "./evaluate";
export type { EvaluationResult } from "./evaluate";

export { detectConflict } from "./conflict";
export type { ConflictResult } from "./conflict";

export { determineRoutes, executeRoutes } from "./route";

export { recalculateConfidence, getConfidence } from "./confidence";
export type { ConfidenceScores } from "./confidence";

export { runExpirationSweep } from "./expire";
export type { ExpireResult } from "./expire";

export { resolveProposal } from "./resolve-proposal";
export type { ResolveResult } from "./resolve-proposal";

// Layer validation
export { validateLayerData } from "./validate-layer";
export type { ValidationResult } from "./validate-layer";

// App-level dependency injection
export { configureCortex } from "./dispatcher";
export type { CortexEventName, CortexEventDispatcher } from "./dispatcher";

// Operator Profile primitive (introduced by DeskOf, consumed by future apps)
export {
  newOperatorProfile,
  computeProfileConfidence,
  findMatchingTier,
  expertiseTierWeight,
} from "./operator-profile";
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
} from "./operator-profile";
