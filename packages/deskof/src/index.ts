/**
 * @kinetiks/deskof — shared types, math, and primitives for DeskOf.
 *
 * This package contains the cross-cutting domain logic that needs to be
 * importable from apps/do, MCP tools, edge functions, and tests without
 * pulling in any apps/do-specific runtime concerns (Next.js, Supabase
 * clients, Playwright, etc.).
 */

// Types
export type { Platform } from "./types/platform";
export {
  TRACK_CONFIGS,
  TIER_MAX_TRACK,
  TIER_CONTENT_URL_LIMITS,
  canSelectTrack,
} from "./types/track";
export type {
  TrackLevel,
  BillingTier,
  Track,
  WeeklyBudget,
} from "./types/track";
export type {
  Opportunity,
  OpportunityType,
  OpportunityStatus,
  ThreadSnapshot,
  MatchBreakdown,
  ExpertiseTierLevel,
  SkipReason,
} from "./types/opportunity";
export type {
  Reply,
  ReplyStatus,
  ReplyTracking,
  QuoraMatchStatus,
} from "./types/reply";
export type {
  GateResult,
  GateStatus,
  GateCheck,
  GateCheckType,
  GateCheckSeverity,
} from "./types/gate";
export {
  computeCppiScore,
  classifyCppi,
} from "./types/cppi";
export type { CPPI, CPPILevel } from "./types/cppi";

// Scoring math
export {
  computeMatchScore,
  buildBreakdown,
  DEFAULT_WEIGHTS,
} from "./scoring/composite";
export type { ScoringInput, ScoringWeights } from "./scoring/composite";

// Quora fingerprinting (Quality Addendum #1)
export {
  normalizeForFingerprint,
  similarity,
  findBestMatch,
  classifySimilarity,
} from "./fingerprint/quora";
export type { FingerprintMatch } from "./fingerprint/quora";

// Platform abstraction (Phase 1.6)
export { platformRegistry } from "./platform/interface";
export type {
  PlatformClient,
  PlatformIdentity,
  FetchThreadsOptions,
  PostReplyInput,
  PostReplyResult,
  ImportHistoryResult,
  ReplyStatus as PlatformReplyStatus,
} from "./platform/interface";
