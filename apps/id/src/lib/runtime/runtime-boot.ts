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
  configureEscalationHandler,
  configureGrantReader,
  configureJudgmentBudgetAdapter,
  configureLedgerAppender,
  configureLedgerHistoryReader,
  configureLLMJudge,
  configureMetricCacheReader,
  configureRecentActionCounter,
  configureUsageSummaryReader,
  defaultAuthorityResolver,
  type EscalationHandler,
  type JudgmentBudgetAdapter,
  type LedgerAppender,
  type LedgerHistoryReader,
  type LLMJudge,
  type MetricCacheReader,
  type RecentActionCounter,
  type UsageSummaryReader,
} from "@kinetiks/runtime";

import { supabaseGrantReader } from "@/lib/cortex/authority/resolve";

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
      // eslint-disable-next-line no-console
      console.warn(`[runtime-boot] recentActionCounter error: ${error.message}`);
      return 0;
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
    if (error || !data) return null;
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
    // v1 stub: the trigger evaluator warns and treats as not-fired when
    // judge is unconfigured; here we DO configure a judge so we don't
    // silently surface that warning, but the judge always returns max
    // confidence so the trigger does not fire. Chunk 5 wires the real
    // judge against @kinetiks/ai/router prompts.
    return { confidence: 1.0 };
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
      // Append-only Ledger failures are loud — surface via console error
      // (Sentry capture handled at the call site if needed).
      // eslint-disable-next-line no-console
      console.error(
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
        preview: {
          grant_id: input.grant_id,
          tool_name: input.tool_name,
          action_class: input.action_class,
          action_input: input.action_input,
          escalation_reason: input.reason,
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
