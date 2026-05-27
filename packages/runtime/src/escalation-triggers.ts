/**
 * Escalation trigger evaluator per the Kinetiks Contract Addendum §2.10.
 *
 * Called by the authority resolver after constraint/rate/envelope
 * checks pass. Iterates the grant's `escalation_triggers` array in
 * cost order (cheapest first), short-circuits on the first triggered.
 *
 * Cost order (cheapest → most expensive):
 *   threshold → pacing → novelty → anomaly → llm_judged
 *
 * Each trigger type uses its own adapter, configured at boot via the
 * module-level setters in `./authority.ts`. Triggers whose adapters
 * are unconfigured are treated as not-fired (graceful degradation —
 * the caller should wire all adapters at boot for production).
 *
 * Returns the original `trigger_index` from the input array so the
 * resolver / Ledger entry can reference WHICH trigger fired even
 * though evaluation order may not match input order.
 */

import {
  anomalyConditionSchema,
  ESCALATION_TRIGGER_CONDITION_SCHEMAS,
  llmJudgedConditionSchema,
  noveltyConditionSchema,
  pacingConditionSchema,
  thresholdConditionSchema,
} from "@kinetiks/types";
import type {
  AnomalyCondition,
  EscalationTrigger,
  EscalationTriggerType,
  LLMJudgedCondition,
  NoveltyCondition,
  PacingCondition,
  ThresholdCondition,
} from "@kinetiks/types";
import { getActionClass } from "@kinetiks/tools";

import {
  getLedgerHistoryReader,
  getLLMJudge,
  getMetricCacheReader,
  getRecentActionCounter,
  getUsageSummaryReader,
} from "./authority";
import { checkLLMJudgmentBudget } from "./llm-judgment-budgets";

// Cost-order weight (lower = cheaper / evaluate sooner).
const COST_ORDER: Record<EscalationTriggerType, number> = {
  threshold: 0,
  pacing: 1,
  novelty: 2,
  anomaly: 3,
  llm_judged: 4,
};

export interface EvaluationContext {
  account_id: string;
  action_class: string;
  action_input: Record<string, unknown>;
  grant_id: string;
}

export type TriggerEvaluationResult =
  | { triggered: false }
  | {
      triggered: true;
      type: EscalationTriggerType;
      trigger_index: number;
      reason: string;
    };

/**
 * Evaluate escalation triggers, cost-ordered, short-circuit on first
 * triggered. Triggers whose condition fails its per-type Zod schema
 * are treated as malformed and skipped with a warning — the structural
 * validator at the Authority Agent's proposal time should have caught
 * malformed conditions pre-persist.
 */
export async function evaluateEscalationTriggers(
  triggers: EscalationTrigger[],
  ctx: EvaluationContext,
): Promise<TriggerEvaluationResult> {
  if (triggers.length === 0) return { triggered: false };

  // Tag with original index, sort by cost, evaluate.
  const indexed = triggers.map((t, i) => ({ trigger: t, original_index: i }));
  indexed.sort(
    (a, b) => COST_ORDER[a.trigger.type] - COST_ORDER[b.trigger.type],
  );

  for (const { trigger, original_index } of indexed) {
    const schema = ESCALATION_TRIGGER_CONDITION_SCHEMAS[trigger.type];
    const parsed = schema.safeParse(trigger.condition);
    if (!parsed.success) {
      // Malformed condition — skip with a defensive warning. (The
      // structural validator at proposal time should have caught it.)
      // eslint-disable-next-line no-console
      console.warn(
        `[runtime/escalation-triggers] Malformed condition for trigger type "${trigger.type}" at index ${original_index}; skipping.`,
      );
      continue;
    }

    const result = await evaluateOne(
      trigger.type,
      parsed.data,
      ctx,
      original_index,
    );
    if (result.triggered) return result;
  }
  return { triggered: false };
}

async function evaluateOne(
  type: EscalationTriggerType,
  condition: unknown,
  ctx: EvaluationContext,
  trigger_index: number,
): Promise<TriggerEvaluationResult> {
  switch (type) {
    case "threshold":
      return evaluateThreshold(condition as ThresholdCondition, ctx, trigger_index);
    case "pacing":
      return evaluatePacing(condition as PacingCondition, ctx, trigger_index);
    case "novelty":
      return evaluateNovelty(condition as NoveltyCondition, ctx, trigger_index);
    case "anomaly":
      return evaluateAnomaly(condition as AnomalyCondition, ctx, trigger_index);
    case "llm_judged":
      return evaluateLLMJudged(
        condition as LLMJudgedCondition,
        ctx,
        trigger_index,
      );
  }
}

// ============================================================
// threshold
// ============================================================

/**
 * Compare a top-level field on action_input to a fixed value.
 * Triggers when the comparison is TRUE — i.e. when the condition
 * shape `{parameter_name, operator, value}` evaluates to true on
 * action_input[parameter_name].
 *
 * Operators map: gt→>, lt→<, gte→>=, lte→<=, eq→===, neq→!==.
 *
 * Non-numeric action_input fields short-circuit to not-fired (the
 * threshold trigger is numeric-only by spec).
 */
function evaluateThreshold(
  condition: ThresholdCondition,
  ctx: EvaluationContext,
  trigger_index: number,
): TriggerEvaluationResult {
  const value = ctx.action_input[condition.parameter_name];
  if (typeof value !== "number") return { triggered: false };

  const cmp = condition.value;
  const fired = (() => {
    switch (condition.operator) {
      case "gt":
        return value > cmp;
      case "lt":
        return value < cmp;
      case "gte":
        return value >= cmp;
      case "lte":
        return value <= cmp;
      case "eq":
        return value === cmp;
      case "neq":
        return value !== cmp;
    }
  })();
  if (!fired) return { triggered: false };
  return {
    triggered: true,
    type: "threshold",
    trigger_index,
    reason: `Threshold ${condition.parameter_name} ${condition.operator} ${condition.value} crossed (actual: ${value})`,
  };
}

// ============================================================
// pacing
// ============================================================

/**
 * Compare the recent action count under this grant to the trigger's
 * `max_actions`. For windows of `day`/`week`, prefers the rolled-up
 * usage_summary (faster + always available); for `minute`/`hour`, hits
 * the live recent-action counter (sub-day windows need fresh data).
 *
 * If both adapters are unconfigured, treat as not-fired.
 */
async function evaluatePacing(
  condition: PacingCondition,
  ctx: EvaluationContext,
  trigger_index: number,
): Promise<TriggerEvaluationResult> {
  if (condition.window === "day" || condition.window === "week") {
    const usageReader = getUsageSummaryReader();
    if (usageReader) {
      const summary = await usageReader.fetchUsageSummary(ctx.grant_id);
      const count = summary?.action_counts[ctx.action_class] ?? 0;
      if (count >= condition.max_actions) {
        return {
          triggered: true,
          type: "pacing",
          trigger_index,
          reason: `Pacing trigger: ${count} actions in current ${condition.window} (cap ${condition.max_actions})`,
        };
      }
      return { triggered: false };
    }
  }
  // Sub-day window or no usage summary: hit live counter.
  const counter = getRecentActionCounter();
  if (!counter) return { triggered: false };
  const windowMs = windowToMs(condition.window);
  const count = await counter.countRecent({
    grant_id: ctx.grant_id,
    action_class: ctx.action_class,
    window_ms: windowMs,
  });
  if (count >= condition.max_actions) {
    return {
      triggered: true,
      type: "pacing",
      trigger_index,
      reason: `Pacing trigger: ${count} actions in last ${condition.window} (cap ${condition.max_actions})`,
    };
  }
  return { triggered: false };
}

// ============================================================
// novelty
// ============================================================

/**
 * Compute the centroid of past (grant_id, action_class) action inputs,
 * test mean per-field relative distance of the inbound input against
 * the centroid. Triggers when the average normalized distance exceeds
 * `similarity_threshold` (i.e. the new input is far from typical).
 *
 * v1 algorithm:
 *   - Fetch the last 50 action_input_summary payloads (descending
 *     recency).
 *   - If history.length < condition.min_history: not fired (no basis).
 *   - For each numeric field shared with the inbound input, compute
 *     mean across history (centroid).
 *   - For each centroid field, compute per-field relative distance:
 *       d_k = |inbound[k] - centroid[k]| / (|centroid[k]| + 1)
 *     The +1 stabilizes the denominator when the centroid is near zero.
 *   - distance = mean(d_k).
 *   - Trigger when distance > similarity_threshold.
 *
 * Cosine similarity, the more conventional choice for high-dimensional
 * vectors, degenerates to 1.0 on 1D vectors (single shared numeric
 * field — common for v1 action classes), so it doesn't work as a
 * one-size-fits-all metric here. Normalized per-field distance works
 * for both 1D and N-D and matches the spec's intent: "how far is this
 * input from typical?".
 *
 * Non-numeric fields are skipped (centroid is well-defined only on
 * numerics). A history with zero numeric overlap → not fired (no
 * basis for comparison).
 */
async function evaluateNovelty(
  condition: NoveltyCondition,
  ctx: EvaluationContext,
  trigger_index: number,
): Promise<TriggerEvaluationResult> {
  const reader = getLedgerHistoryReader();
  if (!reader) return { triggered: false };
  const history = await reader.fetchActionHistory({
    grant_id: ctx.grant_id,
    action_class: ctx.action_class,
    limit: 50,
  });
  if (history.length < condition.min_history) return { triggered: false };

  const inboundVec = extractNumericVec(ctx.action_input);
  if (Object.keys(inboundVec).length === 0) return { triggered: false };

  const centroid: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const entry of history) {
    const vec = extractNumericVec(entry.action_input_summary);
    for (const [k, v] of Object.entries(vec)) {
      if (k in inboundVec) {
        centroid[k] = (centroid[k] ?? 0) + v;
        counts[k] = (counts[k] ?? 0) + 1;
      }
    }
  }
  for (const k of Object.keys(centroid)) {
    centroid[k] = centroid[k] / counts[k];
  }
  if (Object.keys(centroid).length === 0) return { triggered: false };

  const distance = normalizedFieldDistance(inboundVec, centroid);
  if (distance > condition.similarity_threshold) {
    return {
      triggered: true,
      type: "novelty",
      trigger_index,
      reason: `Novelty trigger: action input differs from historical centroid (distance ${distance.toFixed(3)} > threshold ${condition.similarity_threshold})`,
    };
  }
  return { triggered: false };
}

function extractNumericVec(obj: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (Array.isArray(v)) out[`${k}_length`] = v.length;
  }
  return out;
}

/**
 * Mean per-field relative distance between two numeric vectors over
 * their shared keys. Stable when a centroid value is near zero by
 * adding 1 to the denominator (rather than ε division).
 *
 *   d_k    = |a[k] - b[k]| / (|b[k]| + 1)
 *   result = mean(d_k) over shared keys
 *
 * Returns 0 when there are no shared keys.
 */
function normalizedFieldDistance(
  inbound: Record<string, number>,
  centroid: Record<string, number>,
): number {
  const shared = Object.keys(inbound).filter((k) => k in centroid);
  if (shared.length === 0) return 0;
  let sum = 0;
  for (const k of shared) {
    const diff = Math.abs(inbound[k] - centroid[k]);
    sum += diff / (Math.abs(centroid[k]) + 1);
  }
  return sum / shared.length;
}

// ============================================================
// anomaly
// ============================================================

/**
 * v1: query the metric cache directly, compute z-score against the
 * cached mean/stddev, trigger if |z| > zscore_threshold. Full Oracle
 * integration is deferred to a later phase.
 *
 * Returns not-fired if the metric is not cached on the account (no
 * basis for anomaly judgment).
 */
async function evaluateAnomaly(
  condition: AnomalyCondition,
  ctx: EvaluationContext,
  trigger_index: number,
): Promise<TriggerEvaluationResult> {
  const reader = getMetricCacheReader();
  if (!reader) return { triggered: false };
  const stats = await reader.fetchMetricStats({
    account_id: ctx.account_id,
    metric: condition.metric,
  });
  if (!stats || stats.stddev === 0) return { triggered: false };
  const z = (stats.latest - stats.mean) / stats.stddev;
  if (Math.abs(z) > condition.zscore_threshold) {
    return {
      triggered: true,
      type: "anomaly",
      trigger_index,
      reason: `Anomaly on metric '${condition.metric}': latest=${stats.latest.toFixed(3)} z=${z.toFixed(2)} exceeds ±${condition.zscore_threshold}`,
    };
  }
  return { triggered: false };
}

// ============================================================
// llm_judged
// ============================================================

/**
 * v1: check the per-class judgment budget; on exhaustion, apply the
 * declared fallback (`structured_only` returns not-fired; `escalate_to_user`
 * returns fired). On allowed, call the LLM judge through the configured
 * adapter and compare returned confidence to the trigger threshold.
 * Trigger fires when confidence < threshold (the lower the confidence,
 * the more the LLM doubts this action is appropriate).
 *
 * Without the LLMJudge adapter the trigger cannot be evaluated; treat
 * as not-fired with a warning. Production callers must wire the judge.
 */
async function evaluateLLMJudged(
  condition: LLMJudgedCondition,
  ctx: EvaluationContext,
  trigger_index: number,
): Promise<TriggerEvaluationResult> {
  const descriptor = getActionClass(ctx.action_class);
  if (!descriptor) {
    // Shouldn't happen — boot validation catches unregistered classes.
    return { triggered: false };
  }

  const budget = await checkLLMJudgmentBudget({
    account_id: ctx.account_id,
    descriptor,
  });
  if (!budget.allowed) {
    if (budget.fallback === "structured_only") return { triggered: false };
    // escalate_to_user
    return {
      triggered: true,
      type: "llm_judged",
      trigger_index,
      reason: `LLM judgment budget exhausted for ${ctx.action_class} (daily $${budget.spent_today_usd.toFixed(2)}/$${budget.effective_cap_daily_usd.toFixed(2)}); fallback=escalate_to_user`,
    };
  }

  const judge = getLLMJudge();
  if (!judge) {
    // eslint-disable-next-line no-console
    console.warn(
      `[runtime/escalation-triggers] LLM judge adapter not configured; llm_judged trigger skipped for ${ctx.action_class}`,
    );
    return { triggered: false };
  }

  const { confidence } = await judge.judge({
    account_id: ctx.account_id,
    action_class: ctx.action_class,
    prompt_task: condition.prompt_task,
    action_input: ctx.action_input,
  });

  if (confidence < condition.confidence_threshold) {
    return {
      triggered: true,
      type: "llm_judged",
      trigger_index,
      reason: `LLM judgment: confidence ${confidence.toFixed(2)} < threshold ${condition.confidence_threshold}`,
    };
  }
  return { triggered: false };
}

// ============================================================
// helpers
// ============================================================

function windowToMs(window: "minute" | "hour" | "day" | "week"): number {
  switch (window) {
    case "minute":
      return 60 * 1000;
    case "hour":
      return 60 * 60 * 1000;
    case "day":
      return 24 * 60 * 60 * 1000;
    case "week":
      return 7 * 24 * 60 * 60 * 1000;
  }
}

// Re-export schemas (some test fixtures want them).
export {
  thresholdConditionSchema,
  pacingConditionSchema,
  noveltyConditionSchema,
  anomalyConditionSchema,
  llmJudgedConditionSchema,
};
