/**
 * Scout operator types - contact enrichment, pairing, and scoring.
 */

export interface EnrichedCompany {
  name: string;
  website: string;
  industry: string;
  size: number | null;
  location: string;
  description: string;
  founded: number | null;
  linkedinUrl: string;
}

export interface ContactCandidate {
  name: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  hasWorkEmail: boolean;
  seniority: string;
  linkedinUrl: string;
  company: string;
  source: "pdl" | "hunter" | "apollo" | "linkedin" | "manual";
}

export interface ScoredCandidate extends ContactCandidate {
  primaryScore: number;
  secondaryScore: number;
}

export interface PairedContact {
  name: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  linkedinUrl: string;
  reason?: string;
}

export type PairStatus = "pair_found" | "primary_only" | "secondary_only" | "none_found";

export interface PairResult {
  primary: PairedContact | null;
  secondary: PairedContact | null;
  status: PairStatus;
  reasoning?: string;
  allCandidates: ScoredCandidate[] | ContactCandidate[];
}

export interface PairingConfig {
  primary_title_keywords: string[];
  primary_seniority: string;
  secondary_title_keywords: string[];
  secondary_seniority: string;
  fallback_primary?: "next_best" | "none";
}

export interface HunterEmailResult {
  email: string;
  score: number;
  position: string;
  company: string;
}

export interface ResearchBrief {
  company_summary: string;
  personalization_hooks: string[];
  relevance_angle: string;
}

export interface PageContext {
  domain: string;
  companyName?: string;
  pageTitle?: string;
  metaDescription?: string;
  h1Tags?: string[];
  aboutText?: string;
}
