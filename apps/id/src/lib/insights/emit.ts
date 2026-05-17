import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultDeliveryChannel, defaultExpiresAt } from "./deliver";
import type { EmitInsightInput, Insight } from "./types";

/**
 * Emit one Insight to `kinetiks_insights`. Failures degrade
 * permissively — an insight failing to write must not break the
 * surface that emitted it (e.g., an approval decision must still
 * succeed even if the insight insert fails).
 *
 * Returns the inserted row on success, or null on failure. The caller
 * is expected to fire-and-forget for non-critical insights and to
 * `await` + branch for insights that are part of a critical path.
 *
 * Per CLAUDE.md PII rules: `evidence` and `suggested_action` must be
 * ids + primitives. Callers that need to surface free text put it in
 * `summary` (which is bounded user-safe copy).
 */
export async function emitInsight(
  admin: SupabaseClient,
  input: EmitInsightInput,
): Promise<Insight | null> {
  const deliveryChannel =
    input.delivery_channel ?? defaultDeliveryChannel(input.severity);
  const expiresAt =
    input.expires_at === undefined
      ? defaultExpiresAt(input.severity)
      : input.expires_at;

  const row = {
    account_id: input.account_id,
    team_scope_id: input.team_scope_id ?? null,
    type: input.type,
    severity: input.severity,
    summary: input.summary,
    evidence: input.evidence ?? {},
    suggested_action: input.suggested_action ?? null,
    delivery_channel: deliveryChannel,
    expires_at: expiresAt,
    source_app: input.source_app ?? "kinetiks_id",
    source_operator: input.source_operator ?? null,
    correlation_id: input.correlation_id ?? null,
    thread_id: input.thread_id ?? null,
    agent_run_id: input.agent_run_id ?? null,
    proposal_id: input.proposal_id ?? null,
    approval_id: input.approval_id ?? null,
    grant_id: input.grant_id ?? null,
    pattern_id: input.pattern_id ?? null,
    ai_call_id: input.ai_call_id ?? null,
    tool_call_id: input.tool_call_id ?? null,
  };

  const { data, error } = await admin
    .from("kinetiks_insights")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[insights] emit failed", {
      type: input.type,
      severity: input.severity,
      code: error.code,
    });
    return null;
  }
  return data as Insight;
}

/** Mark an insight as delivered. Idempotent — the trigger stamps delivered_at. */
export async function markInsightDelivered(
  admin: SupabaseClient,
  insightId: string,
): Promise<void> {
  const { error } = await admin
    .from("kinetiks_insights")
    .update({ delivered: true })
    .eq("id", insightId)
    .eq("delivered", false);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[insights] markDelivered failed", { insightId, code: error.code });
  }
}

/** Fetch undelivered insights for proactive surfacing. */
export async function listUndeliveredInsights(
  admin: SupabaseClient,
  accountId: string,
  options: {
    minSeverity?: "info" | "notable" | "urgent";
    limit?: number;
  } = {},
): Promise<Insight[]> {
  let query = admin
    .from("kinetiks_insights")
    .select("*")
    .eq("account_id", accountId)
    .eq("delivered", false)
    .eq("dismissed", false)
    .order("created_at", { ascending: false });

  if (options.minSeverity) {
    const order: Record<"info" | "notable" | "urgent", number> = {
      info: 0,
      notable: 1,
      urgent: 2,
    };
    const min = order[options.minSeverity];
    const allowed = (["info", "notable", "urgent"] as const).filter(
      (s) => order[s] >= min,
    );
    query = query.in("severity", allowed);
  }
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[insights] list undelivered failed", { code: error.code });
    return [];
  }
  return (data ?? []) as Insight[];
}
