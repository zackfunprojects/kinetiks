/**
 * Platform contract: registry descriptors.
 *
 * These are the canonical shapes that apps, integrations, and agents
 * declare to plug into the Kinetiks platform. Each descriptor is the
 * input to one of the three registries (Tool / Action Class / Operator)
 * that live in `@kinetiks/tools`.
 *
 * Per CLAUDE.md, these are append-only contracts. Breaking changes
 * require a documented version bump in the platform contract.
 *
 * Per the Kinetiks Contract Addendum §1.3, §2.4, §3.3 — descriptors govern shape
 * validation at registration time. Apps that emit malformed descriptors
 * fail at boot, not at runtime.
 */

import type { ZodSchema } from "zod";
import type { PatternOutcomeDirection } from "./patterns";

// ============================================================
// Common helpers
// ============================================================

/** Rate limit declaration: count per window. */
export interface RateLimitConfig {
  count: number;
  window: "minute" | "hour" | "day" | "week";
}

/** LLM model identifier the platform supports for in-runtime judgment. */
export type LLMJudgmentModel = "haiku" | "sonnet";

/**
 * Behavior when an LLM-judged trigger's daily/monthly USD budget is exhausted.
 *  - `structured_only`: silently fall back to structured-only triggers (anomaly, novelty, etc.)
 *  - `escalate_to_user`: route the action to the approval queue
 */
export type LLMJudgmentFallback = "structured_only" | "escalate_to_user";

/** Per-action-class LLM judgment cost budget. */
export interface LLMJudgmentBudget {
  daily_usd: number;
  monthly_usd: number;
  model: LLMJudgmentModel;
  fallback_on_budget_exhausted: LLMJudgmentFallback;
}

// ============================================================
// Tool Descriptor (metadata side of AgentTool)
// ============================================================

/**
 * The structural metadata of an agent tool, sans the `execute` function.
 * `AgentTool` in `@kinetiks/tools` extends this with behavior. The
 * descriptor side is what gets serialized to Marcus's capability manifest.
 */
export interface ToolDescriptor {
  /** Globally unique, namespaced by app prefix. e.g. "ga4_query", "hv_send_email". */
  name: string;
  /** Pinned tool version. Bumps on incompatible input/output schema changes. */
  version?: string;
  /** LLM-readable: when to use, what is returned, what limitations apply. */
  description: string;
  /**
   * Input/output Zod schemas. Runtime validates input against `inputSchema`
   * before execute and output against `outputSchema` after, refusing on
   * mismatch.
   */
  inputSchema: ZodSchema;
  outputSchema: ZodSchema;
  /** True if the tool mutates external state (send, publish, charge, etc.). */
  isConsequential: boolean;
  /**
   * The registered `action_class` this tool maps to. REQUIRED when
   * `isConsequential` is true; ignored otherwise. Authority resolution
   * uses this to find covering grants.
   */
  actionClass?: string;
  /**
   * Confidence threshold above which the action auto-approves without a
   * per-action approval card. Range: 0-1. `null` = always queue.
   * Ignored when an active Authority Grant covers the call.
   */
  autoApproveThreshold: number | null;
  /** Per-account availability declaration. */
  availability: AvailabilityPredicate;
}

/** Per-account availability rule for a tool. */
export type AvailabilityPredicate =
  | { kind: "always" }
  | { kind: "connection_required"; provider: string }
  | { kind: "plan_required"; min_plan: "free" | "standard" | "hero" }
  | { kind: "custom"; key: string };

// ============================================================
// Action Class Descriptor
// ============================================================

/**
 * Per the Kinetiks Contract Addendum §2.4. An `action_class` is the unit of trust
 * for Authority Grants. Every consequential tool that can be authorized
 * under a grant references one.
 *
 * Customer-facing copy is enforced at the schema level via
 * `customer_template`. The literal phrase "Authority Grant" must NOT
 * appear in customer-facing strings; use "permission" / "authority".
 */
export interface ActionClassDescriptor {
  /** `<app>.<verb>_<noun>`, e.g. "implosion.adjust_bid", "harvest.send_email". */
  action_class: string;
  source_app: string;
  /** LLM-readable summary of what this action class represents. */
  description: string;
  /** Validates the shape of a `GrantedCapability.constraints` payload. */
  constraint_schema: ZodSchema;
  /** Default rate limit suggested by the app; grants may tighten. */
  rate_limit_default: RateLimitConfig | null;
  /**
   * Plain-language template rendered for the customer card. Uses
   * `{var}` placeholders matching constraint field names. Example:
   *   "Adjust bids up or down by up to {max_pct_change}% at a time."
   */
  customer_template: string;
  /** Optional LLM judgment budget for `llm_judged` escalation triggers. */
  llm_judgment_budget?: LLMJudgmentBudget;
  /** If true, exhausted LLM judgment budget escalates rather than degrades. */
  llm_judgment_required?: boolean;
  /**
   * Whether this class may appear in a manifest's `default_standing_grants`.
   * Off by default. Only enable for non-spending, no-external-state classes.
   */
  available_in_default_standing_grants: boolean;
  /** True for spend-bearing classes; grant must reference a Budget category. */
  always_requires_budget_attachment: boolean;
}

// ============================================================
// Operator Descriptor (per the Kinetiks Contract Addendum §3.3)
// ============================================================

/**
 * An Operator is a registered agent within an app. Apps with internal
 * Workflows declare their Operators here so a `WorkflowTask` can target
 * them by key.
 *
 * Apps without internal Workflows omit the `operator_registry` field
 * on their manifest entirely.
 */
export interface OperatorDescriptor {
  /** Unique within the declaring app. e.g. "creative_generator", "scout". */
  key: string;
  /** LLM-readable summary of the Operator's responsibility. */
  description: string;
  /** Validates the input given to the Operator's run() entry point. */
  inputs_schema: ZodSchema;
  /** Validates the output shape the Operator emits. */
  outputs_schema: ZodSchema;
  /** Names of registered tools this Operator may invoke. */
  required_tools: readonly string[];
  /**
   * Pattern type keys this Operator reads from the Pattern Library.
   * Validated against the Pattern Type Registry at L1a boot.
   */
  required_patterns: readonly string[];
  /** Action classes this Operator may invoke. */
  action_classes: readonly string[];
}

// ============================================================
// Pattern Type Descriptor (per the Kinetiks Contract Addendum §1.3)
// ============================================================

/**
 * Decay bounds the calibration job (Phase 2) is allowed to operate
 * inside. Phase 1 reads `initial_decay_days` only.
 */
export interface PatternDecayBounds {
  /** Default `effective_decay_days` at pattern creation. */
  readonly initial_decay_days: number;
  /** Phase 2 calibration cannot shorten effective decay below this. */
  readonly decay_floor_days: number;
  /** Phase 2 calibration cannot lengthen effective decay above this. */
  readonly decay_ceiling_days: number;
  /**
   * Minimum observation_count before Phase 2 calibration is allowed to
   * adjust `effective_decay_days` for this pattern. Phase 1 ignores.
   */
  readonly calibration_sample_threshold: number;
}

/** Phase 1 confidence thresholds for the lifecycle state machine. */
export interface PatternConfidenceThresholds {
  /** `emerging → validated` triggers when confidence_score >= this value. */
  readonly validate_at: number;
  /** `validated → declining` triggers when confidence_score <= this value. */
  readonly decline_at: number;
}

/**
 * Per the Kinetiks Contract Addendum §1.3. A `pattern_type` is the
 * registered shape an app may emit to the Pattern Library. Every
 * dimension of identity (the fingerprint), the single primary outcome
 * metric, every read-side boundary, and the lifecycle thresholds are
 * declared here.
 *
 * Canonical L1b shape: SINGLE primary outcome per pattern type (no
 * outcome_metrics array). Multi-outcome insights are modeled as
 * separate pattern types sharing fingerprint dimensions (e.g.
 * harvest.icp_resonance.reply_rate vs harvest.icp_resonance.deal_close_rate).
 *
 * Source attribution is single-app (one pattern_type belongs to one
 * source app). Read scoping has two orthogonal axes:
 *  - `read_apps`: runtime trust boundary; which agent apps may see this
 *    type via `query_patterns`.
 *  - `customer_visible`: UI exposure; whether this type appears in the
 *    Cortex Patterns sub-tab.
 *
 * Bucketization is mandatory for high-cardinality dimensions. The
 * single biggest failure mode of the Pattern Library is pattern type
 * explosion, prevented by bucketing raw inputs to coarse identity
 * before fingerprinting.
 */
export interface PatternTypeDescriptor<
  TDimensions extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Globally unique key, app-prefixed. e.g.
   * "harvest.outreach_angle_performance.reply_rate".
   */
  readonly pattern_type: string;
  /**
   * The app that owns this pattern type. Patterns of this type can
   * only be emitted by this app. Pattern row's `source_app` equals
   * this value.
   */
  readonly source_app: string;
  /** LLM-readable summary of what the pattern represents and when to trust it. */
  readonly description: string;
  /** Optional example dimensions block for LLM grounding. */
  readonly example?: Record<string, unknown>;
  /**
   * Agent apps that may read patterns of this type via `query_patterns`.
   * Enforced at the tool execute() layer.
   */
  readonly read_apps: readonly string[];
  /**
   * If true, patterns of this type appear in the Cortex Patterns
   * sub-tab. Orthogonal to `read_apps`. UI exposure is a separate axis
   * from runtime trust.
   */
  readonly customer_visible: boolean;
  /**
   * Zod schema validating the `dimensions` field of an emission. Apps
   * that emit malformed dimensions fail at the emission endpoint.
   */
  readonly dimensions_schema: ZodSchema<TDimensions>;
  /**
   * Identity-relevant dimension fields in canonical order. Only these
   * fields contribute to the fingerprint; non-identity dimensions ride
   * along in `dimensions` for the customer's record without affecting
   * pattern identity.
   */
  readonly fingerprint_dimensions: ReadonlyArray<keyof TDimensions>;
  /**
   * Coarse-grained bucketing of raw dimension values. Run server-side
   * BEFORE canonicalization and fingerprinting. Required for any
   * dimension whose raw cardinality exceeds a low threshold; without
   * it, patterns proliferate and never accumulate enough observations
   * to validate.
   *
   * Input is arbitrary (apps pass un-bucketized dimensions); output
   * must conform to TDimensions (validated against dimensions_schema
   * by the caller after bucketize runs).
   */
  readonly bucketize?: (raw: Record<string, unknown>) => TDimensions;

  // ── Outcome (canonical single-primary) ──────────────────────
  /** The single outcome metric this pattern tracks. e.g. "reply_rate". */
  readonly outcome_metric: string;
  /**
   * Unit string. Emissions MUST submit a payload whose `outcome_metric`
   * matches and whose semantic unit matches. Use a small closed
   * vocabulary: "ratio_0_1", "count", "seconds", "currency_usd", etc.
   */
  readonly outcome_unit: string;
  /** Whether higher or lower outcome_value is better. Drives lift interpretation. */
  readonly outcome_direction: PatternOutcomeDirection;

  /** Bounds within which Phase 2 calibration may adjust effective decay. */
  readonly decay_bounds: PatternDecayBounds;
  /** Confidence thresholds for lifecycle transitions. `validate_at > decline_at`. */
  readonly confidence_thresholds: PatternConfidenceThresholds;
  /**
   * Cardinality intent. Warns at registration if absent on a
   * non-trivial type; rejects if absurdly high. Helps prevent pattern
   * type explosion (Kinetiks Contract Addendum §1.3).
   */
  readonly expected_max_fingerprints_per_account?: number;
}
