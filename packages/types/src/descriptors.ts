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
 * Per the 2027 addendum §1.3, §2.4, §3.3 — descriptors govern shape
 * validation at registration time. Apps that emit malformed descriptors
 * fail at boot, not at runtime.
 */

import type { ZodSchema } from "zod";

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
 * Per the 2027 addendum §2.4. An `action_class` is the unit of trust
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
// Operator Descriptor (per the 2027 addendum §3.3)
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
   * Validated against the Pattern Type Registry when that lands in L1a.
   */
  required_patterns: readonly string[];
  /** Action classes this Operator may invoke. */
  action_classes: readonly string[];
}
