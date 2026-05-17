import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AICallLogPayload, AICallLogger } from "@kinetiks/ai";

/**
 * Supabase-backed AICallLogger. Writes one row per call to
 * kinetiks_ai_calls using the service-role client. Failures here are
 * caught by the router; they never block the calling path.
 *
 * Per CLAUDE.md:
 *  - metadata is primitives + string arrays only (no PII, no payloads)
 *  - errorMessage is generic (e.g. "rate_limited"), never raw upstream
 *  - team_scope_id is always null in v1
 */
export const supabaseAICallLogger: AICallLogger = async (payload: AICallLogPayload) => {
  const supabase = createAdminClient();

  const row = {
    account_id: payload.context.accountId ?? null,
    team_scope_id: payload.context.teamScopeId ?? null,
    user_id: payload.context.userId ?? null,

    task: payload.task,
    model: payload.model,
    prompt_version: payload.promptVersion ?? null,
    attempt_number: payload.attemptNumber,
    parent_call_id: payload.parentCallId ?? null,

    correlation_id: payload.context.correlationId ?? null,
    thread_id: payload.context.threadId ?? null,
    agent_run_id: payload.context.agentRunId ?? null,
    proposal_id: payload.context.proposalId ?? null,
    approval_id: payload.context.approvalId ?? null,
    grant_id: payload.context.grantId ?? null,
    pattern_id: payload.context.patternId ?? null,
    tool_call_id: payload.context.toolCallId ?? null,

    status: payload.status,
    error_class: payload.errorClass ?? null,
    error_message: payload.errorMessage ?? null,

    input_tokens: payload.inputTokens ?? null,
    output_tokens: payload.outputTokens ?? null,
    cache_read_tokens: payload.cacheReadTokens ?? null,
    cache_write_tokens: payload.cacheWriteTokens ?? null,
    cost_usd: payload.costUsd ?? null,

    latency_ms: payload.latencyMs,
    started_at: payload.startedAt,
    completed_at: payload.completedAt,

    metadata: payload.metadata,
  };

  const { error } = await supabase.from("kinetiks_ai_calls").insert(row);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[ai-logger] failed to write ai_calls row", { task: payload.task, code: error.code });
  }
};
