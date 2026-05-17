import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ToolCallLogPayload, ToolCallLogger } from "@kinetiks/tools";

/**
 * Supabase-backed ToolCallLogger.
 *
 * One row per execution attempt, including dedup short-circuits and
 * failures (the executor calls the logger on every terminal status).
 *
 * Per CLAUDE.md:
 *  - metadata is primitives + string arrays only (no PII, no payloads)
 *  - errorMessage is generic categorical (e.g. "invalid_input"), never raw upstream
 *  - team_scope_id is always null in v1
 */
export const supabaseToolCallLogger: ToolCallLogger = async (payload: ToolCallLogPayload) => {
  const supabase = createAdminClient();

  const row = {
    account_id: payload.accountId ?? null,
    team_scope_id: payload.teamScopeId ?? null,
    user_id: payload.userId ?? null,

    tool_name: payload.toolName,
    tool_version: payload.toolVersion ?? null,
    is_consequential: payload.isConsequential,
    action_class: payload.actionClass ?? null,
    invoked_by_agent: payload.invokedByAgent,
    parent_ai_call_id: payload.parentAiCallId ?? null,

    idempotency_key: payload.idempotencyKey ?? null,

    correlation_id: payload.correlationId ?? null,
    thread_id: payload.threadId ?? null,
    agent_run_id: payload.agentRunId ?? null,
    proposal_id: payload.proposalId ?? null,
    approval_id: payload.approvalId ?? null,
    grant_id: payload.grantId ?? null,
    pattern_id: payload.patternId ?? null,

    status: payload.status,
    error_message: payload.errorMessage ?? null,
    authority_outcome: payload.authorityOutcome ?? null,

    latency_ms: payload.latencyMs,
    started_at: payload.startedAt,
    completed_at: payload.completedAt,

    metadata: payload.metadata,
  };

  const { error } = await supabase.from("kinetiks_tool_calls").insert(row);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[tool-call-logger] insert failed", {
      tool: payload.toolName,
      code: error.code,
    });
  }
};
