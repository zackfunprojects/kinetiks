/**
 * Lens (quality gate) input/output contracts.
 *
 * Lens is a pure, IO-free engine. Callers in apps/do hydrate a
 * `LensInput` from Supabase + the Operator Profile, then call
 * `runLens(input, config)`.
 *
 * Output is the existing `GateResult` shape from `../types/gate.ts`,
 * which is what `/api/reply/draft` and `ReplyEditor` already speak.
 */

import type { GateCheckType } from "../types/gate";
import type { Platform } from "../types/platform";
import type { CPPI } from "../types/cppi";

/**
 * 30-day rolling promotional ratio for one platform. Loaded from
 * `deskof_platform_health` (see migration 00025).
 */
export interface PlatformHealthSnapshot {
  platform: Platform;
  posts_total: number;
  posts_promotional: number;
  /** posts_promotional / posts_total, clamped 0-1. NaN-safe upstream. */
  self_promo_ratio: number;
  snapshot_date: string;
}

/**
 * Recent post metadata for topic-spacing comparison. The vector is
 * the lens-side hashed bag-of-bigrams (see ./vectorize.ts).
 */
export interface RecentReplyVector {
  reply_id: string;
  community: string | null;
  posted_at: string;
  vector: number[];
}

/**
 * Per-community calibration override row from
 * `deskof_community_gate_config`. All fields optional — when missing,
 * the engine uses defaults from CHECK_DEFAULTS.
 */
export interface CommunityGateConfig {
  platform: Platform;
  community: string;
  thresholds: Partial<Record<GateCheckType, { advisory: number; blocking: number }>>;
  /** Observed post-gate removal rate, 0-1 */
  removal_rate: number;
  sample_size: number;
}

/**
 * Subset of OperatorProfile that the lens engine actually consumes.
 * Keeping this narrow lets the package avoid importing
 * @kinetiks/cortex into the IO-free lens layer.
 */
export interface LensOperatorView {
  /** ISO timestamp the operator profile was created (used to compute calibration phase) */
  created_at: string;
  /** Per-check sensitivity multipliers from gate_adjustments */
  per_check_sensitivity: Record<string, number>;
  /** Product names the operator is associated with — used by link_presence + cppi */
  product_names: string[];
}

/**
 * Async LLM client the engine uses for tone / redundancy /
 * question_responsiveness. The injector lives in apps/do
 * (`apps/do/src/lib/lens/llm.ts`). The package itself never reaches
 * the network.
 *
 * `complete` MUST throw on failure (timeout, missing key, transport
 * error, parse error). The engine catches and degrades silently to a
 * "skipped" check.
 */
export interface LensLLM {
  complete(opts: {
    system: string;
    user: string;
    maxTokens?: number;
  }): Promise<string>;
}

export interface LensInput {
  content: string;
  platform: Platform;
  /** Subreddit / Quora topic; null when unknown */
  community: string | null;
  /** Optional question text from the thread, used by question_responsiveness */
  threadQuestion?: string | null;

  operator: LensOperatorView;

  /** 30-day platform health for the *current* platform (Lens only reads one). */
  platformHealth: PlatformHealthSnapshot | null;

  /** Latest cross-platform CPPI snapshot (rolling 7d). Null = no data yet. */
  cppi: CPPI | null;

  /** Last-7-day reply vectors for the user (any platform). */
  recentVectors: RecentReplyVector[];

  /** Optional community override row */
  communityConfig?: CommunityGateConfig | null;

  /**
   * LLM client. May be null on free tier or in tests; engine then
   * skips LLM-backed checks entirely (they don't even appear as
   * skipped rows when the user has no entitlement).
   */
  llm: LensLLM | null;
}

/**
 * Which checks are "blocking-eligible" in the current calibration phase.
 * If a check returns severity=blocking but isn't in this set, the engine
 * down-weights it to advisory.
 */
export type EnabledChecks = ReadonlySet<GateCheckType>;

export interface LensConfig {
  /** True for the user's first 30 days. Forces final status to never be "blocked". */
  advisory_only: boolean;
  /** Which checks may produce a "blocked" status. */
  blocking_enabled: EnabledChecks;
  /**
   * Which LLM-backed checks the user is entitled to (Standard+).
   * Free-tier callers pass an empty set so they're never even attempted.
   */
  llm_checks_enabled: ReadonlySet<GateCheckType>;
  /** Per-check threshold overrides (defaults live in checks/defaults.ts). */
  thresholds: Partial<Record<GateCheckType, { advisory: number; blocking: number }>>;
  /** Per-check sensitivity multipliers (1.0 = default). */
  sensitivity: Record<string, number>;
}
