/**
 * Escalation trigger condition schemas — per the Kinetiks Contract Addendum §2.10.
 *
 * Each of the five v1 trigger types declares a Zod schema for its
 * `condition` payload. The runtime evaluator (Phase 4 — Chunk 4 at
 * `packages/runtime/src/escalation-triggers.ts`) parses each trigger's
 * condition through the matching schema before evaluation. The
 * Authority Agent's structural validator (Phase 4 — Chunk 5) parses
 * the same way at proposal time, so malformed conditions never reach
 * the row.
 *
 * Per CLAUDE.md, these are append-only contracts. Breaking changes
 * require a platform-contract version bump.
 */

import { z } from "zod";

import type { EscalationTriggerType } from "./authority-grants";

// ============================================================
// Per-type condition schemas
// ============================================================

/**
 * `threshold` — explicit numeric thresholds on action parameters.
 *
 * Example: "escalate if spend > 500 USD per action" maps to
 *   { parameter_name: "spend", operator: ">", value: 500 }.
 *
 * The runtime evaluator looks up `parameter_name` on the inbound
 * action input and compares against `value` using `operator`. The
 * lookup is shallow (top-level field); nested-path access is deferred
 * to v1.1 if needed.
 */
export const thresholdConditionSchema = z.object({
  parameter_name: z.string().min(1),
  operator: z.enum(["gt", "lt", "gte", "lte", "eq", "neq"]),
  value: z.number(),
});
export type ThresholdCondition = z.infer<typeof thresholdConditionSchema>;

/**
 * `pacing` — action rate deviation from baseline.
 *
 * Example: "escalate if more than 50 actions per day under this grant"
 * maps to { window: "day", max_actions: 50 }.
 *
 * For sub-day windows the runtime evaluator hits the live Ledger
 * filtered by (grant_id, action_class, created_at > now() - window);
 * for daily/weekly windows it consults the nightly-rolled
 * usage_summary instead. Per the Phase 4 plan, the index
 * `(grant_id, action_class, created_at DESC)` on `kinetiks_ledger` is
 * non-negotiable.
 */
export const pacingConditionSchema = z.object({
  window: z.enum(["minute", "hour", "day", "week"]),
  max_actions: z.number().int().positive(),
});
export type PacingCondition = z.infer<typeof pacingConditionSchema>;

/**
 * `novelty` — action input differs from historical pattern.
 *
 * The runtime evaluator fetches the last N Ledger entries for
 * (grant_id, action_class), extracts the constraint-schema-declared
 * dimensions from each `action_input_summary`, computes a centroid,
 * and tests cosine similarity of the inbound input against it. If
 * `1 - similarity > similarity_threshold`, escalate.
 *
 * `min_history` is the minimum prior-action count required to compute
 * a meaningful centroid; below it, the trigger does not fire (no
 * basis for novelty judgement).
 */
export const noveltyConditionSchema = z.object({
  similarity_threshold: z.number().min(0).max(1),
  min_history: z.number().int().nonnegative().default(5),
});
export type NoveltyCondition = z.infer<typeof noveltyConditionSchema>;

/**
 * `anomaly` — statistical anomaly in a tracked metric.
 *
 * v1 reads `kinetiks_metric_cache` directly (full Oracle integration
 * is deferred). The metric must be cached on the account. The
 * evaluator computes a z-score against the rolling mean/stddev stored
 * on the cache row and triggers if |z| > `zscore_threshold`.
 */
export const anomalyConditionSchema = z.object({
  metric: z.string().min(1),
  zscore_threshold: z.number().positive(),
});
export type AnomalyCondition = z.infer<typeof anomalyConditionSchema>;

/**
 * `llm_judged` — LLM evaluates the action in context.
 *
 * Most expensive trigger type; budgeted per (account_id, action_class)
 * via the LLM Judgment Budget module (Phase 4 — Chunk 4). The
 * evaluator routes the call through `@kinetiks/ai/router` with task
 * `authority.llm_judged.<action_class>` and the model declared on the
 * action class. If the returned confidence < `confidence_threshold`,
 * escalate. If the per-class budget is exhausted, the declared
 * fallback applies (`structured_only` ignores this trigger;
 * `escalate_to_user` treats it as fired).
 *
 * `prompt_task` is a free-form identifier the evaluator passes
 * through; the actual prompt is registered in
 * `@kinetiks/ai/prompts.ts`.
 */
export const llmJudgedConditionSchema = z.object({
  prompt_task: z.string().min(1),
  confidence_threshold: z.number().min(0).max(1),
});
export type LLMJudgedCondition = z.infer<typeof llmJudgedConditionSchema>;

// ============================================================
// Registry lookup
// ============================================================

/**
 * Map from trigger type to its condition schema. The Authority Agent
 * validator and the runtime evaluator both look up the matching
 * schema via this registry and call `.parse()` on the condition.
 */
export const ESCALATION_TRIGGER_CONDITION_SCHEMAS = {
  threshold: thresholdConditionSchema,
  pacing: pacingConditionSchema,
  novelty: noveltyConditionSchema,
  anomaly: anomalyConditionSchema,
  llm_judged: llmJudgedConditionSchema,
} as const satisfies Record<EscalationTriggerType, z.ZodSchema>;

/**
 * Parses a trigger's `condition` against the schema matching its
 * `type`. Returns the typed condition on success; throws on failure
 * with a `ZodError` whose message identifies the trigger type.
 */
export function parseEscalationCondition(
  type: EscalationTriggerType,
  condition: unknown,
): unknown {
  const schema = ESCALATION_TRIGGER_CONDITION_SCHEMAS[type];
  return schema.parse(condition);
}
