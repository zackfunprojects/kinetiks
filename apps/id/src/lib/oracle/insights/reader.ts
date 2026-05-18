/**
 * Insight readers.
 *
 * Three read paths:
 *   - loadInsightsForBrief({ accountId, ... })  → Marcus pre-analysis
 *   - loadInsightsForTool({ accountId, ... })   → query_insights tool
 *   - markInsightsDelivered(admin, ids)         → engine post-Sonnet
 *
 * The brief reader and the tool reader share the same query shape but
 * project differently (brief: minimal evidence; tool: same shape +
 * unbounded count up to limit).
 *
 * `delivered=true` is stamped ONLY by markInsightsDelivered (called by
 * the Marcus engine when Sonnet's response cites the insight_id). Tool
 * surfacing does not stamp. Per user decision 4 in the D2 plan.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { projectInsight } from "./projector";
import type { InsightProjection, SignalSeverity } from "./types";

const DEFAULT_SINCE_HOURS = 72;
const DEFAULT_BRIEF_LIMIT = 5;
const HARD_TOOL_LIMIT = 10;

const SEVERITY_RANK: Record<SignalSeverity, number> = {
  info: 0,
  notable: 1,
  urgent: 2,
};

export interface BriefReaderInput {
  admin: SupabaseClient;
  accountId: string;
  /** Default 72h. */
  sinceHours?: number;
  /** Default 'notable' — only notable + urgent appear in the brief. */
  severityFloor?: SignalSeverity;
  limit?: number;
}

export async function loadInsightsForBrief(
  input: BriefReaderInput
): Promise<InsightProjection[]> {
  const sinceIso = new Date(
    Date.now() - (input.sinceHours ?? DEFAULT_SINCE_HOURS) * 60 * 60 * 1000
  ).toISOString();
  const limit = input.limit ?? DEFAULT_BRIEF_LIMIT;
  const severityFloor = input.severityFloor ?? "notable";

  const { data, error } = await input.admin
    .from("kinetiks_insights")
    .select(
      "id, type, severity, source_app, summary, evidence, suggested_action, created_at"
    )
    .eq("account_id", input.accountId)
    .eq("delivered", false)
    .eq("dismissed", false)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return [];
  const rows = data ?? [];
  // Filter + sort + limit app-side so we can use enum-aware severity rank
  const filtered = rows
    .filter((r) => SEVERITY_RANK[r.severity as SignalSeverity] >= SEVERITY_RANK[severityFloor])
    .sort((a, b) => {
      const sevDelta = SEVERITY_RANK[b.severity as SignalSeverity] - SEVERITY_RANK[a.severity as SignalSeverity];
      if (sevDelta !== 0) return sevDelta;
      return b.created_at.localeCompare(a.created_at);
    })
    .slice(0, limit);

  return filtered.map((r) =>
    projectInsight({
      id: r.id,
      type: r.type,
      severity: r.severity,
      source_app: r.source_app,
      summary: r.summary,
      evidence: r.evidence,
      suggested_action: r.suggested_action,
      created_at: r.created_at,
    })
  );
}

export interface ToolReaderInput {
  admin: SupabaseClient;
  accountId: string;
  severityFloor: SignalSeverity;
  types?: string[];
  sourceApps?: string[];
  sinceHours: number;
  includeDelivered: boolean;
  limit: number;
}

export async function loadInsightsForTool(
  input: ToolReaderInput
): Promise<InsightProjection[]> {
  const sinceIso = new Date(Date.now() - input.sinceHours * 60 * 60 * 1000).toISOString();
  const cappedLimit = Math.min(input.limit, HARD_TOOL_LIMIT);

  let q = input.admin
    .from("kinetiks_insights")
    .select(
      "id, type, severity, source_app, summary, evidence, suggested_action, created_at"
    )
    .eq("account_id", input.accountId)
    .eq("dismissed", false)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });

  if (!input.includeDelivered) {
    q = q.eq("delivered", false);
  }
  if (input.types && input.types.length > 0) {
    q = q.in("type", input.types);
  }
  if (input.sourceApps && input.sourceApps.length > 0) {
    q = q.in("source_app", input.sourceApps);
  }

  const { data, error } = await q.limit(50);
  if (error) return [];

  const filtered = (data ?? [])
    .filter(
      (r) => SEVERITY_RANK[r.severity as SignalSeverity] >= SEVERITY_RANK[input.severityFloor]
    )
    .slice(0, cappedLimit);

  return filtered.map((r) => projectInsight(r as never));
}

/**
 * Stamp delivered=true on the listed insight ids. Caller has validated
 * the ids against an allowlist (the ids loaded for the current Marcus
 * turn), so no further filtering needed here.
 */
export async function markInsightsDelivered(
  admin: SupabaseClient,
  ids: string[]
): Promise<{ updated: number }> {
  if (ids.length === 0) return { updated: 0 };
  const { data, error } = await admin
    .from("kinetiks_insights")
    .update({ delivered: true })
    .in("id", ids)
    .eq("delivered", false)
    .select("id");

  if (error) return { updated: 0 };
  return { updated: data?.length ?? 0 };
}
