import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { captureException } from "@/lib/observability/sentry";
import {
  aggregateActivity,
  type ActivityLedgerRow,
  type ActivityOracleRunRow,
  type ActivityToolCallRow,
  type AgentActivitySummary,
  ACTIVITY_LEDGER_EVENT_TYPES,
} from "./aggregate";

export type { AgentActivitySummary } from "./aggregate";

/** Bounded reads: a summary, not a ledger browser (that is Cortex > Ledger). */
const LEDGER_ROW_CAP = 1000;
const TOOL_CALL_ROW_CAP = 200;
const ORACLE_RUN_ROW_CAP = 50;

/**
 * B4 — read-only agent-activity summary for the chat rail. Narrates the
 * operator division of labor from rows that already exist (oracle runs,
 * ledger events, tool_calls). Zero new instrumentation.
 *
 * Side-panel philosophy per CLAUDE.md: each query failure captures to
 * Sentry with a stage tag and falls back to empty, so one broken source
 * never blanks the panel.
 */
export async function loadAgentActivitySummary(
  admin: SupabaseClient,
  accountId: string,
  windowHours = 24,
): Promise<AgentActivitySummary> {
  const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

  const [oracleRuns, ledgerEvents, toolCalls] = await Promise.all([
    loadOracleRuns(admin, accountId, since),
    loadLedgerEvents(admin, accountId, since),
    loadMarcusToolCalls(admin, accountId, since),
  ]);

  return aggregateActivity({
    windowHours,
    oracleRuns,
    ledgerEvents,
    toolCalls,
  });
}

async function loadOracleRuns(
  admin: SupabaseClient,
  accountId: string,
  since: string,
): Promise<ActivityOracleRunRow[]> {
  try {
    const { data, error } = await admin
      .from("kinetiks_oracle_runs")
      .select("started_at, status, insights_written, sources_evaluated")
      .eq("account_id", accountId)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(ORACLE_RUN_ROW_CAP);
    if (error) throw new Error(error.message);
    return (data ?? []) as ActivityOracleRunRow[];
  } catch (err) {
    await captureException(err, {
      tags: {
        route: "/api/activity/summary",
        action: "activity.load",
        stage: "oracle_runs",
        app: "id",
      },
      user: { id: accountId },
      extra: {},
    });
    return [];
  }
}

async function loadLedgerEvents(
  admin: SupabaseClient,
  accountId: string,
  since: string,
): Promise<ActivityLedgerRow[]> {
  try {
    const { data, error } = await admin
      .from("kinetiks_ledger")
      .select("event_type")
      .eq("account_id", accountId)
      .gte("created_at", since)
      .in("event_type", [...ACTIVITY_LEDGER_EVENT_TYPES])
      .limit(LEDGER_ROW_CAP);
    if (error) throw new Error(error.message);
    return (data ?? []) as ActivityLedgerRow[];
  } catch (err) {
    await captureException(err, {
      tags: {
        route: "/api/activity/summary",
        action: "activity.load",
        stage: "ledger",
        app: "id",
      },
      user: { id: accountId },
      extra: {},
    });
    return [];
  }
}

async function loadMarcusToolCalls(
  admin: SupabaseClient,
  accountId: string,
  since: string,
): Promise<ActivityToolCallRow[]> {
  try {
    const { data, error } = await admin
      .from("kinetiks_tool_calls")
      .select("tool_name")
      .eq("account_id", accountId)
      .eq("invoked_by_agent", "marcus")
      .gte("started_at", since)
      .limit(TOOL_CALL_ROW_CAP);
    if (error) throw new Error(error.message);
    return (data ?? []) as ActivityToolCallRow[];
  } catch (err) {
    await captureException(err, {
      tags: {
        route: "/api/activity/summary",
        action: "activity.load",
        stage: "tool_calls",
        app: "id",
      },
      user: { id: accountId },
      extra: {},
    });
    return [];
  }
}
