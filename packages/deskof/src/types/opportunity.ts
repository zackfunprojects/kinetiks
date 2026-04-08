import type { Platform } from "./platform";

/**
 * Cached snapshot of a thread on Reddit or Quora at the moment it was
 * surfaced to a user. Lives in deskof_threads.
 */
export interface ThreadSnapshot {
  id: string;
  platform: Platform;
  /** Reddit thread ID or Quora question ID */
  external_id: string;
  url: string;
  /** Reddit subreddit OR Quora space slug */
  community: string;
  title: string;
  body: string | null;
  /** Reddit upvotes / Quora views */
  score: number;
  comment_count: number;
  created_at: string;
  fetched_at: string;
}

export type ExpertiseTierLevel =
  | "core_authority"
  | "credible_adjacency"
  | "genuine_curiosity";

export type OpportunityType = "professional" | "personal" | "crossover";

export type OpportunityStatus =
  | "pending"
  | "accepted"
  | "skipped"
  | "expired";

export type SkipReason =
  | "already_well_answered"
  | "not_my_expertise"
  | "too_promotional"
  | "bad_timing"
  | "other";

export interface MatchBreakdown {
  /** 0-1 alignment between user expertise and thread topic */
  expertise_fit: number;
  /** 0-1 prediction that this is the right moment to reply */
  timing_score: number;
  /** 0-1 probability that this thread will be cited by an LLM */
  citation_probability: number;
  /** 0-1 size of the answer gap the user could fill */
  answer_gap_score: number;
  /** Negative signals that suppress the score */
  anti_signal_flags: string[];
}

export interface Opportunity {
  id: string;
  user_id: string;
  thread: ThreadSnapshot;
  /** Composite 0-100 match score */
  match_score: number;
  match_breakdown: MatchBreakdown;
  /** LLM-generated angle string. Null on free tier (gated). */
  suggested_angle: string | null;
  expertise_tier_matched: ExpertiseTierLevel;
  opportunity_type: OpportunityType;
  surfaced_at: string;
  expires_at: string;
  status: OpportunityStatus;
  skip_reason?: SkipReason;
}
