/**
 * LLM judgment budget enforcement per the Kinetiks Contract Addendum §2.10.
 *
 * The `llm_judged` escalation trigger is the most expensive trigger
 * type: each evaluation is an inference call. To keep costs bounded
 * and predictable, every action class that uses `llm_judged` declares
 * a per-(account_id, action_class) daily and monthly USD budget. When
 * the budget is exhausted, the declared fallback applies:
 *
 *   - `structured_only`  — treat the trigger as not fired; the action
 *                          proceeds if other structured triggers pass.
 *   - `escalate_to_user` — treat the trigger as fired; the action
 *                          escalates to per-action approval.
 *
 * Spend aggregation per D2: query `kinetiks_ai_calls` filtered by
 *   account_id = $1
 *   task       = 'authority.llm_judged.' || $action_class
 *   started_at >= $window_start
 *   status     = 'success'
 *
 * Migration 00053 added the supporting composite index
 * `(account_id, task, started_at DESC) WHERE status = 'success'`.
 *
 * Override composition per addendum §2.10:
 *   effective_cap = max(class.cap, override.cap)
 * (additive expansion, not replacement). Nested-grant boundedness is
 * validated at PROPOSAL time, not here — by the time the resolver
 * arrives, the override has already passed the parent-grant subset
 * rules.
 */

import type { ActionClassDescriptor } from "@kinetiks/types";

import {
  getJudgmentBudgetAdapter,
  type JudgmentBudgetAdapter,
} from "./authority";

export interface JudgmentBudgetCheckInput {
  account_id: string;
  /** The action class whose `llm_judgment_budget` is enforced. */
  descriptor: ActionClassDescriptor;
  /** Per-grant override (from GrantedCapability.llm_judgment_budget_override). */
  override?: {
    daily_usd?: number;
    monthly_usd?: number;
  };
  /** Optional injected adapter — defaults to the module-level configured one. */
  adapter?: JudgmentBudgetAdapter;
}

export interface JudgmentBudgetCheckResult {
  allowed: boolean;
  /** Set when allowed === false. */
  fallback?: "structured_only" | "escalate_to_user";
  spent_today_usd: number;
  spent_month_usd: number;
  effective_cap_daily_usd: number;
  effective_cap_monthly_usd: number;
}

/**
 * Check the per-(account_id, action_class) judgment budget.
 *
 * Returns `allowed: true` when:
 *   - the action class declares no `llm_judgment_budget` (judgment is
 *     effectively free; downstream caller may still skip the call)
 *   - the effective daily AND monthly caps are not yet reached
 *
 * Returns `allowed: false, fallback: ...` when EITHER cap is reached,
 * with the declared fallback mode.
 *
 * Behavior when the adapter is not configured:
 *   - If the action class has no budget declared → allowed: true
 *     (graceful degradation; tests can call this without wiring an adapter).
 *   - If the action class HAS a budget declared but no adapter to enforce
 *     it → defensive deny with `escalate_to_user` fallback. This is the
 *     safe default: production callers always wire the adapter.
 */
export async function checkLLMJudgmentBudget(
  input: JudgmentBudgetCheckInput,
): Promise<JudgmentBudgetCheckResult> {
  const budget = input.descriptor.llm_judgment_budget;
  // No budget declared → no enforcement.
  if (!budget) {
    return {
      allowed: true,
      spent_today_usd: 0,
      spent_month_usd: 0,
      effective_cap_daily_usd: Infinity,
      effective_cap_monthly_usd: Infinity,
    };
  }

  const adapter = input.adapter ?? getJudgmentBudgetAdapter();
  if (!adapter) {
    // Safe default: deny with the action class's declared fallback OR
    // `escalate_to_user` when llm_judgment_required is set; otherwise
    // `structured_only` which lets the action proceed via structured-
    // trigger-only evaluation.
    const fallback: "structured_only" | "escalate_to_user" =
      input.descriptor.llm_judgment_required
        ? "escalate_to_user"
        : budget.fallback_on_budget_exhausted;
    return {
      allowed: false,
      fallback,
      spent_today_usd: 0,
      spent_month_usd: 0,
      effective_cap_daily_usd: budget.daily_usd,
      effective_cap_monthly_usd: budget.monthly_usd,
    };
  }

  const now = new Date();
  const startOfDayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const startOfMonthUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  // Effective caps: additive expansion (max of class-declared and override).
  const effective_cap_daily_usd = Math.max(
    budget.daily_usd,
    input.override?.daily_usd ?? 0,
  );
  const effective_cap_monthly_usd = Math.max(
    budget.monthly_usd,
    input.override?.monthly_usd ?? 0,
  );

  const [spent_today_usd, spent_month_usd] = await Promise.all([
    adapter.getSpend({
      account_id: input.account_id,
      action_class: input.descriptor.action_class,
      since: startOfDayUtc,
    }),
    adapter.getSpend({
      account_id: input.account_id,
      action_class: input.descriptor.action_class,
      since: startOfMonthUtc,
    }),
  ]);

  if (
    spent_today_usd >= effective_cap_daily_usd ||
    spent_month_usd >= effective_cap_monthly_usd
  ) {
    return {
      allowed: false,
      fallback: budget.fallback_on_budget_exhausted,
      spent_today_usd,
      spent_month_usd,
      effective_cap_daily_usd,
      effective_cap_monthly_usd,
    };
  }

  return {
    allowed: true,
    spent_today_usd,
    spent_month_usd,
    effective_cap_daily_usd,
    effective_cap_monthly_usd,
  };
}
