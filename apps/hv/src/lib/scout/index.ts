/**
 * Scout operator - prospecting intelligence.
 * Barrel export for all Scout modules.
 */

// Types
export type {
  EnrichedCompany,
  ContactCandidate,
  ScoredCandidate,
  PairedContact,
  PairResult,
  PairingConfig,
  HunterEmailResult,
  ResearchBrief,
  PageContext,
  PairStatus,
} from "./types";

// PDL enrichment
export { enrichCompany, searchPeople, searchPeopleByCompanyName, searchPeopleAny } from "./pdl";

// Hunter email resolution
export { findEmail, searchDomain } from "./hunter";

// Contact pairing
export { selectPair, guessSeniority } from "./pairing";
export { selectPairWithClaude } from "./ai-pairing";

// Enrichment waterfall
export { enrichDomain } from "./enrichment";

// Lead scoring
export { calculateFitScore, calculateIntentScore, calculateLeadScore } from "./lead-scoring";
