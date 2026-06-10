/**
 * Authority resolution per the Kinetiks Contract Addendum §2.9.
 *
 * Phase 4 replaced the F2 stub (always-`auto_threshold`) with the real
 * §2.9 flow. The runtime's `AgentRun.invokeTool` calls
 * `getAuthorityResolver()` once per logical tool call and switches on
 * the resolved outcome:
 *
 *   - `grant_covers`   → execute, log Ledger `authority_action_taken`
 *   - `escalated`      → DO NOT execute, enqueue per-action approval,
 *                        log Ledger `authority_action_escalated`,
 *                        throw `queued_for_approval`
 *   - `denied`         → DO NOT execute, throw `denied_by_authority`
 *   - `auto_threshold` → fall through to existing per-tool flow
 *   - `fallback`       → same as `auto_threshold` (per run aggregation)
 *
 * The §2.9 algorithm:
 *
 *   1. Skip if the tool is non-consequential or declares no action_class.
 *   2. Find any active grant for (account_id, action_class) whose scope
 *      applies. Narrowest-scope wins: campaign > workflow > program > standing.
 *   3. Validate the action_input against the action class's registered
 *      constraint_schema, then against the grant's grant_capability.constraints.
 *   4. Enforce the grant's rate_limit if set.
 *   5. Enforce the spending envelope if the action class is spend-bearing.
 *   6. Evaluate escalation_triggers cost-ordered (cheapest first), short-
 *      circuit on first triggered.
 *   7. All checks pass → grant_covers.
 *
 * Dependencies are injected via module-level configuration functions
 * (mirrors @kinetiks/ai logger seam):
 *
 *   - GrantReader               — Supabase query against kinetiks_authority_grants
 *   - RecentActionCounter       — count of (grant_id, action_class) events in a window
 *   - UsageSummaryReader        — rolled-up usage_summary for daily/weekly pacing
 *   - LedgerHistoryReader       — past action_input summaries for novelty centroid
 *   - MetricCacheReader         — z-score lookup for anomaly trigger
 *   - LLMJudge                  — Haiku call for llm_judged trigger
 *   - JudgmentBudgetAdapter     — aggregate ai_calls cost for budget check
 *   - LedgerAppender            — write authority_action_* Ledger entries
 *   - EscalationHandler         — enqueue approval rows for escalations
 *
 * The Pattern Library precedent applies: orchestration in
 * packages/runtime, Supabase-backed implementations in
 * apps/id/src/lib/runtime/runtime-boot.ts (Phase 4 — Chunk 4).
 */

import { getActionClass } from "@kinetiks/tools";
import type {
  AgentTool,
  AuthorityOutcome,
} from "@kinetiks/tools";
import type {
  AuthorityGrantScopeType,
  EscalationTrigger,
  EscalationTriggerType,
  GrantedCapability,
} from "@kinetiks/types";

// ============================================================
// Types
// ============================================================

export interface AuthorityReason {
  /** Which check failed. */
  code:
    | "constraint_failed"
    | "rate_limited"
    | "envelope_exceeded"
    | "trigger_fired"
    | "missing_budget";
  /** When code === 'trigger_fired', which trigger type fired. */
  trigger_type?: EscalationTriggerType;
  /** When code === 'trigger_fired', index of the trigger in the grant's list. */
  trigger_index?: number;
  /** Plain-language explanation safe to surface in the approval card. */
  detail: string;
}

export interface MatchedCapability {
  action_class: string;
  constraints: Record<string, unknown>;
}

export interface AuthorityResolution {
  outcome: AuthorityOutcome;
  grantId: string | null;
  /** Populated when outcome is `escalated` or `denied`. */
  reason?: AuthorityReason;
  /** Populated when outcome is `grant_covers`. */
  matchedCapability?: MatchedCapability;
}

export interface ResolveAuthorityCtx {
  accountId: string;
  userId?: string | null;
  invokedByAgent: string;
  threadId?: string | null;
  /** Phase 4: raw action input for constraint + trigger evaluation. */
  actionInput?: unknown;
  /** Phase 4: scope context for narrowest-grant selection. */
  scopeType?: AuthorityGrantScopeType;
  /** Phase 4: scope target id; null for standing-scope resolution. */
  scopeId?: string | null;
  /** Phase 4: optional Budget category id for spend envelope check. */
  budgetCategoryId?: string | null;
  metadata?: Record<string, string | number | boolean | string[]>;
}

export type AuthorityResolver = (
  tool: AgentTool<any, any>,
  ctx: ResolveAuthorityCtx,
) => Promise<AuthorityResolution>;

// ============================================================
// Matched grant shape (returned by GrantReader)
// ============================================================

/**
 * Sub-shape of an `AuthorityGrant` returned by the read helper. Includes
 * just the fields the resolver needs — narrowed for hot-path
 * performance and to keep the cross-package surface small.
 */
export interface MatchedGrant {
  id: string;
  account_id: string;
  scope_type: AuthorityGrantScopeType;
  scope_id: string | null;
  parent_grant_id: string | null;
  granted_at: string;
  expires_at: string | null;
  max_unapproved_spend_per_day: number | null;
  max_unapproved_spend_per_action: number | null;
  spending_currency: string;
  escalation_triggers: EscalationTrigger[];
  /** The single capability matching the requested action class. */
  matched_capability: GrantedCapability;
}

// ============================================================
// Adapter interfaces
// ============================================================

export interface GrantReader {
  /**
   * Find the narrowest-scope active grant covering (account_id, action_class)
   * within the provided scope context. Returns null if no grant covers.
   *
   * Implementation must:
   *   - Filter status='active', expires_at IS NULL OR > now()
   *   - Filter granted_capabilities @> '[{"action_class": $action_class}]'
   *   - Pick narrowest scope: campaign > workflow > program > standing
   *   - For standing-scope resolution (scope_type = 'standing'), match any
   *     standing grant for the action class
   */
  findCoveringGrant(args: {
    account_id: string;
    action_class: string;
    scope_type: AuthorityGrantScopeType;
    scope_id: string | null;
  }): Promise<MatchedGrant | null>;
}

export interface RecentActionCounter {
  /**
   * Count Ledger entries with event_type='authority_action_taken'
   * matching (grant_id, action_class) within `window`.
   */
  countRecent(args: {
    grant_id: string;
    action_class: string;
    window_ms: number;
  }): Promise<number>;
}

export interface UsageSummaryReader {
  /**
   * Fetch the grant's rolled-up usage_summary block. Used by daily/weekly
   * pacing triggers and the rate_limit check at daily+ windows.
   */
  fetchUsageSummary(grant_id: string): Promise<{
    action_counts: Record<string, number>;
    last_computed_at: string | null;
  } | null>;
}

export interface LedgerHistoryReader {
  /**
   * Last N (grant_id, action_class) action_input_summary payloads in
   * descending recency order. Used by the novelty trigger's centroid
   * calculation.
   */
  fetchActionHistory(args: {
    grant_id: string;
    action_class: string;
    limit: number;
  }): Promise<Array<{ action_input_summary: Record<string, unknown>; created_at: string }>>;
}

export interface MetricCacheReader {
  /**
   * Fetch the cached statistical aggregate for `metric`. Returns null if
   * the metric is not cached. Used by the anomaly trigger.
   */
  fetchMetricStats(args: {
    account_id: string;
    metric: string;
  }): Promise<{ mean: number; stddev: number; latest: number } | null>;
}

export interface LLMJudge {
  /**
   * Route an LLM judgment call through @kinetiks/ai/router. Task name
   * format: `authority.llm_judged.<action_class>`. The model is decided
   * by the action class's llm_judgment_budget.model.
   */
  judge(args: {
    account_id: string;
    action_class: string;
    prompt_task: string;
    action_input: Record<string, unknown>;
  }): Promise<{ confidence: number }>;
}

export interface JudgmentBudgetAdapter {
  /**
   * Aggregate `cost_usd` from kinetiks_ai_calls with task =
   * 'authority.llm_judged.<action_class>' and account_id, since the
   * window start, status='success'.
   */
  getSpend(args: {
    account_id: string;
    action_class: string;
    since: Date;
  }): Promise<number>;
}

export interface LedgerAppendInput {
  account_id: string;
  event_type:
    | "authority_grant_proposed"
    | "authority_grant_approved"
    | "authority_grant_paused"
    | "authority_grant_resumed"
    | "authority_grant_narrowed"
    | "authority_grant_revoked"
    | "authority_grant_expired"
    | "authority_action_taken"
    | "authority_action_escalated";
  grant_id: string;
  source_app: string;
  source_operator?: string | null;
  detail: Record<string, unknown>;
}

export interface LedgerAppender {
  append(input: LedgerAppendInput): Promise<void>;
}

export interface EscalationEnqueueInput {
  account_id: string;
  invoked_by_agent: string;
  tool_name: string;
  action_class: string;
  action_input: unknown;
  grant_id: string;
  reason: AuthorityReason;
}

export interface EscalationEnqueueResult {
  approval_id: string;
}

export interface EscalationHandler {
  /**
   * Insert an approval row (approval_class='standard' per addendum §2.9
   * — escalation routes the action through the standard per-action
   * approval flow without modifying the grant).
   */
  enqueue(input: EscalationEnqueueInput): Promise<EscalationEnqueueResult>;
}

// ============================================================
// Module-level adapter configuration
// ============================================================

let _grantReader: GrantReader | null = null;
let _recentActionCounter: RecentActionCounter | null = null;
let _usageSummaryReader: UsageSummaryReader | null = null;
let _ledgerHistoryReader: LedgerHistoryReader | null = null;
let _metricCacheReader: MetricCacheReader | null = null;
let _llmJudge: LLMJudge | null = null;
let _judgmentBudgetAdapter: JudgmentBudgetAdapter | null = null;
let _ledgerAppender: LedgerAppender | null = null;
let _escalationHandler: EscalationHandler | null = null;

export function configureGrantReader(reader: GrantReader | null): void {
  _grantReader = reader;
}
export function getGrantReader(): GrantReader | null {
  return _grantReader;
}

export function configureRecentActionCounter(counter: RecentActionCounter | null): void {
  _recentActionCounter = counter;
}
export function getRecentActionCounter(): RecentActionCounter | null {
  return _recentActionCounter;
}

export function configureUsageSummaryReader(reader: UsageSummaryReader | null): void {
  _usageSummaryReader = reader;
}
export function getUsageSummaryReader(): UsageSummaryReader | null {
  return _usageSummaryReader;
}

export function configureLedgerHistoryReader(reader: LedgerHistoryReader | null): void {
  _ledgerHistoryReader = reader;
}
export function getLedgerHistoryReader(): LedgerHistoryReader | null {
  return _ledgerHistoryReader;
}

export function configureMetricCacheReader(reader: MetricCacheReader | null): void {
  _metricCacheReader = reader;
}
export function getMetricCacheReader(): MetricCacheReader | null {
  return _metricCacheReader;
}

export function configureLLMJudge(judge: LLMJudge | null): void {
  _llmJudge = judge;
}
export function getLLMJudge(): LLMJudge | null {
  return _llmJudge;
}

export function configureJudgmentBudgetAdapter(
  adapter: JudgmentBudgetAdapter | null,
): void {
  _judgmentBudgetAdapter = adapter;
}
export function getJudgmentBudgetAdapter(): JudgmentBudgetAdapter | null {
  return _judgmentBudgetAdapter;
}

export function configureLedgerAppender(appender: LedgerAppender | null): void {
  _ledgerAppender = appender;
}
export function getLedgerAppender(): LedgerAppender | null {
  return _ledgerAppender;
}

export function configureEscalationHandler(handler: EscalationHandler | null): void {
  _escalationHandler = handler;
}
export function getEscalationHandler(): EscalationHandler | null {
  return _escalationHandler;
}

// ── Per-action approval (consequential action with NO covering grant) ──

export interface PerActionApprovalRequest {
  account_id: string;
  invoked_by_agent: string;
  tool_name: string;
  action_class: string;
  action_input: unknown;
  /**
   * The tool descriptor's `autoApproveThreshold`. `null` means the action
   * always requires explicit approval regardless of confidence; a number
   * is the confidence bar above which the per-action flow may auto-approve.
   */
  auto_approve_threshold: number | null;
}

export interface PerActionApprovalDecision {
  decision: "auto_approved" | "queued";
  approval_id: string;
}

/**
 * Handles a consequential action that resolved to `auto_threshold` /
 * `fallback` — i.e. no active grant covers it. Per the Approval System
 * spec and CLAUDE.md, such an action must route through the standard
 * per-action approval flow and may NEVER execute without an approval
 * record. The handler creates the approval (auto-approving only when the
 * tool's confidence bar is met) and returns the decision; the runtime
 * acts on it: execute when `auto_approved`, otherwise throw
 * `queued_for_approval`.
 *
 * Supabase-backed implementation lives in
 * apps/id/src/lib/runtime/runtime-boot.ts. If this handler is not
 * configured the runtime fails CLOSED (throws configuration_error rather
 * than executing) — the opposite of the pre-remediation behavior.
 */
export interface PerActionApprovalHandler {
  request(input: PerActionApprovalRequest): Promise<PerActionApprovalDecision>;
}

let _perActionApprovalHandler: PerActionApprovalHandler | null = null;
export function configurePerActionApprovalHandler(
  handler: PerActionApprovalHandler | null,
): void {
  _perActionApprovalHandler = handler;
}
export function getPerActionApprovalHandler(): PerActionApprovalHandler | null {
  return _perActionApprovalHandler;
}

// ============================================================
// Constraint narrowing validator
// ============================================================

/**
 * Validate `action_input` against the grant's specific `constraints`.
 *
 * The action class's `constraint_schema` already shape-validates the
 * action_input (a tool's input + the grant's constraints both follow
 * the same Zod schema). This helper enforces the grant-specific
 * NARROWING: numeric bounds tighten, array allowlists contain.
 *
 * Convention used by Phase 4 v1 action classes:
 *   - Numeric `max_*` fields on constraints cap the action input's value
 *     at the same field name. e.g. constraints.max_message_length=2000
 *     means action_input.message_length must be ≤ 2000.
 *   - Array constraints (`channels`, `users`, `allowed_from_addresses`,
 *     `calendar_ids`) act as allowlists. The action_input must declare
 *     the SAME field name and its value must be contained in the
 *     allowlist. The literal `"any"` (or `"primary_only"` for calendars)
 *     means "no restriction beyond the schema".
 *   - Boolean constraints (`threading_allowed`, `attachments_allowed`)
 *     gate the corresponding action_input field: if constraint is false,
 *     the matching action_input field must be false.
 *
 * Returns `{ok: true}` if all checks pass; `{ok: false, reason}` on
 * first failure (no exhaustive enumeration to keep error messages
 * focused).
 */
export function validateActionAgainstConstraints(
  action_input: Record<string, unknown>,
  constraints: Record<string, unknown>,
): { ok: true } | { ok: false; reason: string } {
  for (const [key, constraintValue] of Object.entries(constraints)) {
    // Numeric cap convention: max_* fields cap the action_input's
    // matching field at the same name OR the key with the "max_" prefix
    // stripped. e.g. constraints.max_recipients caps action_input.max_recipients
    // OR action_input.recipients.length.
    if (typeof constraintValue === "number" && key.startsWith("max_")) {
      const actionField = key.substring(4); // "max_recipients" → "recipients"
      const directValue = (action_input as Record<string, unknown>)[key];
      const indirectValue = (action_input as Record<string, unknown>)[actionField];
      // Prefer direct numeric match; fall back to indirect (array length / numeric).
      if (typeof directValue === "number" && directValue > constraintValue) {
        return {
          ok: false,
          reason: `Action input '${key}' (${directValue}) exceeds grant constraint (${constraintValue})`,
        };
      }
      if (typeof indirectValue === "number" && indirectValue > constraintValue) {
        return {
          ok: false,
          reason: `Action input '${actionField}' (${indirectValue}) exceeds grant constraint '${key}' (${constraintValue})`,
        };
      }
      if (Array.isArray(indirectValue) && indirectValue.length > constraintValue) {
        return {
          ok: false,
          reason: `Action input '${actionField}' has ${indirectValue.length} items; grant constraint '${key}' caps at ${constraintValue}`,
        };
      }
      continue;
    }
    // Allowlist convention: array constraint or literal sentinel.
    if (Array.isArray(constraintValue)) {
      const allowed = new Set(constraintValue.map((v) => String(v)));
      const actionValue = (action_input as Record<string, unknown>)[key];
      if (actionValue === undefined) continue;
      if (Array.isArray(actionValue)) {
        for (const v of actionValue) {
          if (!allowed.has(String(v))) {
            return {
              ok: false,
              reason: `Action input '${key}' includes '${String(v)}' which is not in the grant's allowlist`,
            };
          }
        }
      } else if (typeof actionValue === "string") {
        if (!allowed.has(actionValue)) {
          return {
            ok: false,
            reason: `Action input '${key}'='${actionValue}' is not in the grant's allowlist`,
          };
        }
      }
      continue;
    }
    // Boolean gate: constraint=false locks the action input to false.
    if (typeof constraintValue === "boolean" && constraintValue === false) {
      const actionValue = (action_input as Record<string, unknown>)[key];
      if (actionValue === true) {
        return {
          ok: false,
          reason: `Action input '${key}'=true is denied by grant constraint`,
        };
      }
      continue;
    }
    // Literal sentinel ("any", "primary_only"): pass-through.
    if (constraintValue === "any" || constraintValue === "primary_only") continue;
  }
  return { ok: true };
}

// ============================================================
// F2 fallback stub (used when adapters are not configured)
// ============================================================

/**
 * F2 default: every call resolves to `auto_threshold`. Active until
 * apps/id wires the real adapters at boot.
 */
export const f2StubAuthorityResolver: AuthorityResolver = async () => ({
  outcome: "auto_threshold",
  grantId: null,
});

// ============================================================
// Default Phase 4 resolver
// ============================================================

/**
 * The real §2.9 resolver. Falls back to F2 stub behavior if the
 * `grantReader` adapter is not configured (e.g. during tests that
 * don't need authority gating).
 *
 * apps/id/src/lib/runtime/runtime-boot.ts configures every adapter at
 * boot and then calls `configureAuthorityResolver(defaultAuthorityResolver)`.
 */
export const defaultAuthorityResolver: AuthorityResolver = async (tool, ctx) => {
  // 1. Non-consequential tools and tools without an action_class skip
  //    the entire flow — they cannot be covered by a grant.
  if (!tool.isConsequential || !tool.actionClass) {
    return { outcome: "auto_threshold", grantId: null };
  }

  const grantReader = _grantReader;
  if (!grantReader) {
    // Adapters not wired — fall back to F2 behavior.
    return { outcome: "auto_threshold", grantId: null };
  }

  // 2. Find narrowest-scope covering grant for this action class.
  const grant = await grantReader.findCoveringGrant({
    account_id: ctx.accountId,
    action_class: tool.actionClass,
    scope_type: ctx.scopeType ?? "standing",
    scope_id: ctx.scopeId ?? null,
  });

  if (!grant) {
    return { outcome: "auto_threshold", grantId: null };
  }

  // 3. Resolve action class descriptor (sanity check — boot validation
  //    should have caught a missing class already).
  const descriptor = getActionClass(tool.actionClass);
  if (!descriptor) {
    return {
      outcome: "denied",
      grantId: grant.id,
      reason: {
        code: "constraint_failed",
        detail: `Unregistered action class: ${tool.actionClass}`,
      },
    };
  }

  // 4. The schema validation of `actionInput` against
  //    descriptor.constraint_schema is the tool's input layer's job at
  //    execute time; the resolver only validates the NARROWING of the
  //    grant's constraints against whatever payload the agent passed.
  const actionInputObj: Record<string, unknown> =
    typeof ctx.actionInput === "object" && ctx.actionInput !== null
      ? (ctx.actionInput as Record<string, unknown>)
      : {};

  const narrowing = validateActionAgainstConstraints(
    actionInputObj,
    grant.matched_capability.constraints,
  );
  if (!narrowing.ok) {
    return {
      outcome: "escalated",
      grantId: grant.id,
      reason: { code: "constraint_failed", detail: narrowing.reason },
    };
  }

  // 5. Rate limit (recent action count).
  if (grant.matched_capability.rate_limit) {
    const counter = _recentActionCounter;
    if (counter) {
      const windowMs = windowToMs(grant.matched_capability.rate_limit.window);
      const recent = await counter.countRecent({
        grant_id: grant.id,
        action_class: tool.actionClass,
        window_ms: windowMs,
      });
      if (recent >= grant.matched_capability.rate_limit.count) {
        return {
          outcome: "escalated",
          grantId: grant.id,
          reason: {
            code: "rate_limited",
            detail: `Grant rate limit reached: ${recent}/${grant.matched_capability.rate_limit.count} per ${grant.matched_capability.rate_limit.window}`,
          },
        };
      }
    }
  }

  // 6. Spending envelope. v1: action classes are all non-spend-bearing
  //    so this branch only enforces the "missing budget" denial path. A
  //    fixture spend-bearing class exercises this path in tests.
  if (descriptor.always_requires_budget_attachment) {
    if (
      grant.max_unapproved_spend_per_day === null &&
      grant.max_unapproved_spend_per_action === null
    ) {
      return {
        outcome: "denied",
        grantId: grant.id,
        reason: {
          code: "missing_budget",
          detail:
            "Spend-bearing action requires a spending envelope on the grant",
        },
      };
    }
    // Phase 4 v1 only enforces the cap on the action's own declared spend.
    // The action input convention is action_input.spend_amount (numeric)
    // when the action is spend-bearing. Fixture flow uses this shape.
    const spendAmount = Number(actionInputObj["spend_amount"]);
    if (Number.isFinite(spendAmount) && spendAmount > 0) {
      if (
        grant.max_unapproved_spend_per_action !== null &&
        spendAmount > grant.max_unapproved_spend_per_action
      ) {
        return {
          outcome: "escalated",
          grantId: grant.id,
          reason: {
            code: "envelope_exceeded",
            detail: `Action spend $${spendAmount} exceeds per-action cap of $${grant.max_unapproved_spend_per_action}`,
          },
        };
      }
    }
  }

  // 7. Escalation triggers (delegated to evaluator). Thread the
  //    grant capability's llm_judgment_budget_override so the
  //    llm_judged trigger sees per-grant additive expansion of the
  //    class-level budget (addendum §2.10; bounded by parent grant
  //    at proposal time).
  if (grant.escalation_triggers.length > 0) {
    const { evaluateEscalationTriggers } = await import("./escalation-triggers");
    const triggerResult = await evaluateEscalationTriggers(
      grant.escalation_triggers,
      {
        account_id: ctx.accountId,
        action_class: tool.actionClass,
        action_input: actionInputObj,
        grant_id: grant.id,
        llm_judgment_budget_override:
          grant.matched_capability.llm_judgment_budget_override,
      },
    );
    if (triggerResult.triggered) {
      return {
        outcome: "escalated",
        grantId: grant.id,
        reason: {
          code: "trigger_fired",
          trigger_type: triggerResult.type,
          trigger_index: triggerResult.trigger_index,
          detail: triggerResult.reason,
        },
      };
    }
  }

  // 8. All checks pass — execute under grant authority.
  return {
    outcome: "grant_covers",
    grantId: grant.id,
    matchedCapability: {
      action_class: tool.actionClass,
      constraints: grant.matched_capability.constraints,
    },
  };
};

let _resolver: AuthorityResolver = f2StubAuthorityResolver;

/** Override the resolver (test seam or boot wiring). */
export function configureAuthorityResolver(resolver: AuthorityResolver | null): void {
  _resolver = resolver ?? f2StubAuthorityResolver;
}

export function getAuthorityResolver(): AuthorityResolver {
  return _resolver;
}

// ============================================================
// Helpers
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

/** Test escape hatch. */
export function _resetAuthorityAdaptersForTests(): void {
  _grantReader = null;
  _recentActionCounter = null;
  _usageSummaryReader = null;
  _ledgerHistoryReader = null;
  _metricCacheReader = null;
  _llmJudge = null;
  _judgmentBudgetAdapter = null;
  _ledgerAppender = null;
  _escalationHandler = null;
  _perActionApprovalHandler = null;
  _resolver = f2StubAuthorityResolver;
}

// Re-export AuthorityOutcome for convenience (RunOptions consumers).
export type { AuthorityOutcome } from "@kinetiks/tools";
