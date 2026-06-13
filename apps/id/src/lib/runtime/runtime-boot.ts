/**
 * Wire the Phase 4 authority adapters at boot per the Kinetiks Contract Addendum §2.9.
 *
 * The runtime layer in `packages/runtime` declares typed adapter
 * interfaces and module-level configuration setters; apps/id provides
 * the Supabase-backed implementations and wires them here. Same model
 * as `configureAICallLogger` in @kinetiks/ai.
 *
 * Boot order in `apps/id/src/instrumentation-node.ts` must call
 * `bootRuntimeAdapters()` AFTER the action class registry and operator
 * registry boot (the resolver references both at runtime), and AFTER
 * the tool registry boot's cross-registry validation (which sanity-
 * checks every tool's actionClass).
 *
 * Until this function runs, the runtime uses the F2 stub resolver
 * (always returns `auto_threshold`). After this function runs, the
 * default resolver is in effect.
 *
 * Adapter coverage in Phase 4:
 *   ✓ GrantReader          (apps/id/src/lib/cortex/authority/resolve.ts)
 *   ✓ RecentActionCounter  (live ledger query)
 *   ✓ UsageSummaryReader   (rolled-up jsonb on the grant row)
 *   ✓ LedgerHistoryReader  (action_input_summary from ledger detail)
 *   ✓ JudgmentBudgetAdapter (kinetiks_ai_calls cost aggregator)
 *   ✓ LedgerAppender       (append-only ledger inserts)
 *   ✓ EscalationHandler    (insert standard approval row)
 *   ☐ MetricCacheReader    (stub returns null until Oracle integration lands)
 *   ☐ LLMJudge             (stub throws until Authority Agent prompts land in Chunk 5)
 *
 * Adapters left as stubs degrade gracefully: the trigger evaluator
 * treats `null` returns as "not enough information; trigger not
 * fired", which is the correct safety stance. Production callers
 * should replace the stubs when their dependencies are available.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@kinetiks/supabase";
import {
  configureAuthorityResolver,
  configureDailySpendCounter,
  configureEscalationHandler,
  configureGrantReader,
  configureJudgmentBudgetAdapter,
  configureLedgerAppender,
  configureLedgerHistoryReader,
  configureLLMJudge,
  configureMetricCacheReader,
  configurePerActionApprovalHandler,
  configureRecentActionCounter,
  configureUsageSummaryReader,
  defaultAuthorityResolver,
  type DailySpendCounter,
  type EscalationHandler,
  type JudgmentBudgetAdapter,
  type LedgerAppender,
  type LedgerHistoryReader,
  type LLMJudge,
  type MetricCacheReader,
  type PerActionApprovalHandler,
  type RecentActionCounter,
  type UsageSummaryReader,
} from "@kinetiks/runtime";

import { supabaseGrantReader } from "@/lib/cortex/authority/resolve";
import { processApproval } from "@/lib/approvals/pipeline";
import type { ApprovalSubmission } from "@/lib/approvals/types";

let _booted = false;

export function bootRuntimeAdapters(): void {
  if (_booted) return;

  configureGrantReader(supabaseGrantReader);
  configureRecentActionCounter(recentActionCounter);
  configureUsageSummaryReader(usageSummaryReader);
  configureLedgerHistoryReader(ledgerHistoryReader);
  configureMetricCacheReader(metricCacheReader);
  configureLLMJudge(llmJudgeStub);
  configureJudgmentBudgetAdapter(judgmentBudgetAdapter);
  configureLedgerAppender(ledgerAppender);
  configureEscalationHandler(escalationHandler);
  configureDailySpendCounter(dailySpendCounter);
  configurePerActionApprovalHandler(perActionApprovalHandler);

  configureAuthorityResolver(defaultAuthorityResolver);

  _booted = true;
}

/** Test escape hatch. */
export function _resetRuntimeAdapterBootForTests(): void {
  _booted = false;
}

// ============================================================
// Adapter implementations
// ============================================================

const recentActionCounter: RecentActionCounter = {
  async countRecent({ grant_id, action_class, window_ms }) {
    const admin = createAdminClient() as unknown as SupabaseClient;
    const since = new Date(Date.now() - window_ms).toISOString();
    const { count, error } = await admin
      .from("kinetiks_ledger")
      .select("id", { count: "exact", head: true })
      .eq("grant_id", grant_id)
      .eq("event_type", "authority_action_taken")
      .gte("created_at", since)
      .contains("detail", { action_class });
    if (error) {
      // Fail loud. Returning 0 on a Supabase outage would let pacing /
      // rate-limit checks falsely report "under cap", silently opening
      // the gate during an outage. The resolver translates this throw
      // into an escalated outcome with detail "adapter error" so the
      // action lands in per-action approval rather than auto-executing.
      throw new Error(
        `[runtime-boot] recentActionCounter Supabase error: ${error.message}`,
      );
    }
    return count ?? 0;
  },
};

const usageSummaryReader: UsageSummaryReader = {
  async fetchUsageSummary(grant_id) {
    const admin = createAdminClient() as unknown as SupabaseClient;
    const { data, error } = await admin
      .from("kinetiks_authority_grants")
      .select("usage_summary")
      .eq("id", grant_id)
      .maybeSingle();
    if (error) {
      // Fail loud per the same reasoning as recentActionCounter — null
      // would let pacing/usage-driven decisions proceed on stale or
      // empty assumptions during a transient Supabase outage.
      throw new Error(
        `[runtime-boot] usageSummaryReader Supabase error: ${error.message}`,
      );
    }
    if (!data) return null; // legitimate "no row" — grant doesn't exist
    const summary = (data as { usage_summary: unknown }).usage_summary as {
      action_counts?: Record<string, number>;
      computed_at?: string | null;
    } | null;
    if (!summary) return null;
    return {
      action_counts: summary.action_counts ?? {},
      last_computed_at: summary.computed_at ?? null,
    };
  },
};

const ledgerHistoryReader: LedgerHistoryReader = {
  async fetchActionHistory({ grant_id, action_class, limit }) {
    const admin = createAdminClient() as unknown as SupabaseClient;
    const { data, error } = await admin
      .from("kinetiks_ledger")
      .select("detail, created_at")
      .eq("grant_id", grant_id)
      .eq("event_type", "authority_action_taken")
      .contains("detail", { action_class })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    const rows = data as Array<{
      detail: Record<string, unknown> | null;
      created_at: string;
    }>;
    return rows.map((r) => ({
      action_input_summary:
        (r.detail?.action_input_summary as Record<string, unknown> | undefined) ??
        {},
      created_at: r.created_at,
    }));
  },
};

const metricCacheReader: MetricCacheReader = {
  async fetchMetricStats() {
    // v1 stub: anomaly trigger gracefully degrades to not-fired when
    // stats are null. Full Oracle anomaly integration is a later phase.
    return null;
  },
};

const llmJudgeStub: LLMJudge = {
  async judge() {
    // TODO(Phase 4 — Chunk 5): replace this stub with the real judge
    // that calls @kinetiks/ai/router with `authority.llm_judged.<action_class>`
    // prompts. Until then, fail CLOSED: return confidence 0 so any
    // grant whose escalation_triggers includes `llm_judged` lands the
    // action in per-action approval instead of silently executing.
    //
    // Failing open (confidence 1.0) is the wrong v1 default — a grant
    // explicitly opted into LLM judgment by including the trigger;
    // bypassing the judgment because we haven't built it yet would
    // violate the customer's stated intent.
    return { confidence: 0.0 };
  },
};

const judgmentBudgetAdapter: JudgmentBudgetAdapter = {
  async getSpend({ account_id, action_class, since }) {
    const admin = createAdminClient() as unknown as SupabaseClient;
    const task = `authority.llm_judged.${action_class}`;
    const { data, error } = await admin
      .from("kinetiks_ai_calls")
      .select("cost_usd")
      .eq("account_id", account_id)
      .eq("task", task)
      .eq("status", "success")
      .gte("started_at", since.toISOString());
    if (error || !data) return 0;
    return (data as Array<{ cost_usd: number | null }>).reduce(
      (sum, r) => sum + (Number(r.cost_usd) || 0),
      0,
    );
  },
};

// E2: the atomic daily-window counter behind the grant spend envelope
// (and the system-email cap in lib/email/sender.ts). One RPC round
// trip per reserve — the cap check and the increment are a single
// conditional statement, so concurrent spend-bearing actions cannot
// both pass a read-then-write check (the D2 TOCTOU class). Fail-loud:
// an RPC error throws; the resolver translates the throw into an
// `escalated` outcome (fail closed), never a permissive default.
const dailySpendCounter: DailySpendCounter = {
  async reserve({ account_id, counter_key, day_utc, amount, cap }) {
    const admin = createAdminClient() as unknown as SupabaseClient;
    const { data, error } = await admin.rpc("_kt_reserve_daily_counter", {
      p_account_id: account_id,
      p_counter_key: counter_key,
      p_day: day_utc,
      p_amount: amount,
      p_cap: cap,
    });
    if (error) {
      throw new Error(
        `[runtime-boot] dailySpendCounter reserve failed: ${error.message}`,
      );
    }
    // NULL from the RPC = the conditional increment refused (over cap).
    // Treat the result as nullable explicitly: the SQL RETURNs NULL on
    // cap-exceed (migration 00080), but a future `pnpm db:types` regen
    // could re-narrow the generated type to non-null `number` and make
    // this refusal path statically dead. The cast keeps the money path
    // honest regardless of what the generator emits.
    const total = data as number | null;
    return total === null
      ? { reserved: false, total_after: null }
      : { reserved: true, total_after: Number(total) };
  },
  async release({ account_id, counter_key, day_utc, amount }) {
    const admin = createAdminClient() as unknown as SupabaseClient;
    const { error } = await admin.rpc("_kt_release_daily_counter", {
      p_account_id: account_id,
      p_counter_key: counter_key,
      p_day: day_utc,
      p_amount: amount,
    });
    if (error) {
      // The caller (run.ts releaseSpendReservation) logs and continues —
      // a failed release over-counts the envelope, the conservative
      // direction. Throwing here gives the caller the real message.
      throw new Error(
        `[runtime-boot] dailySpendCounter release failed: ${error.message}`,
      );
    }
  },
};

const ledgerAppender: LedgerAppender = {
  async append(input) {
    const admin = createAdminClient() as unknown as SupabaseClient;
    const { error } = await admin.from("kinetiks_ledger").insert({
      account_id: input.account_id,
      event_type: input.event_type,
      source_app: input.source_app,
      source_operator: input.source_operator ?? null,
      grant_id: input.grant_id,
      detail: input.detail,
    });
    if (error) {
      // Fail loud. The caller (AgentRun.invokeTool) wraps this in
      // try/catch for the post-mutation `authority_action_taken` case
      // (a ledger failure must not undo a successful external mutation
      // like a sent Slack message). For escalation enqueueing — which
      // happens BEFORE the external mutation — the failure propagates
      // up and the action is rejected. Silent console.error here would
      // make audit drift invisible.
      throw new Error(
        `[runtime-boot] ledgerAppender ${input.event_type} insert failed: ${error.message}`,
      );
    }
  },
};

const escalationHandler: EscalationHandler = {
  async enqueue(input) {
    const admin = createAdminClient() as unknown as SupabaseClient;
    // Per addendum §2.9: escalation routes the action to the standard
    // per-action approval flow. The approval class is `standard`, NOT
    // `authority_grant_proposal` (the grant itself is unchanged; only
    // this single action needs explicit review).
    const { data, error } = await admin
      .from("kinetiks_approvals")
      .insert({
        account_id: input.account_id,
        source_app: "kinetiks_id",
        source_operator: input.invoked_by_agent,
        action_category: input.action_class,
        approval_type: "review",
        approval_class: "standard",
        title: `Action escalated: ${input.tool_name}`,
        description: input.reason.detail,
        // Canonical re-executable `tool_action` preview: on approval,
        // processApprovalDecision → executeApprovedAction runs the action
        // through the runtime (preApproved, with the grant pinned). The
        // grant covered the action; only this instance was escalated.
        preview: {
          type: "tool_action",
          content: {
            tool_name: input.tool_name,
            action_class: input.action_class,
            action_input: input.action_input,
            invoked_by_agent: input.invoked_by_agent,
            grant_id: input.grant_id,
            escalation_reason: input.reason,
          },
        },
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(
        `[runtime-boot] escalationHandler insert failed: ${error?.message ?? "no row returned"}`,
      );
    }
    return { approval_id: (data as { id: string }).id };
  },
};

// ── Per-action approval (consequential action with no covering grant) ──
//
// Routes the action through the standard approval pipeline. Tools whose
// descriptor declares autoApproveThreshold=null always queue (forceQueue);
// a numeric threshold lets the pipeline auto-approve when the confidence
// bar is met. The `tool_action` preview carries the re-executable payload
// so the approve path can run it through the runtime.
const perActionApprovalHandler: PerActionApprovalHandler = {
  async request({
    account_id,
    invoked_by_agent,
    tool_name,
    action_class,
    action_input,
    auto_approve_threshold,
  }) {
    const submission: ApprovalSubmission = {
      source_app: "kinetiks_id",
      source_operator: invoked_by_agent,
      action_category: action_class,
      title: humanizeToolName(tool_name),
      description: `${invoked_by_agent} needs your approval before running this ${action_class} action.`,
      preview: {
        type: "tool_action",
        content: { tool_name, action_class, action_input, invoked_by_agent },
      },
      deep_link: "",
      agent_confidence: 50,
      changes_strategy: false,
      affects_multiple_outputs: false,
      content_length: estimateContentLength(action_input),
      expires_in_hours: null, // pipeline applies per-approval-type defaults
    };
    const result = await processApproval(submission, account_id, {
      forceQueue: auto_approve_threshold === null,
    });
    return {
      decision: result.auto_approved ? "auto_approved" : "queued",
      approval_id: result.approval_id,
    };
  },
};

/** "send_slack_notification" → "Send slack notification" (customer-facing). */
function humanizeToolName(toolName: string): string {
  const label = toolName.replace(/_/g, " ").trim();
  return label.length > 0 ? label.charAt(0).toUpperCase() + label.slice(1) : toolName;
}

/** Sum of string-field lengths; drives the pipeline's specificity heuristic. */
function estimateContentLength(input: unknown): number {
  if (typeof input !== "object" || input === null) return 0;
  let len = 0;
  for (const v of Object.values(input as Record<string, unknown>)) {
    if (typeof v === "string") len += v.length;
  }
  return len;
}
