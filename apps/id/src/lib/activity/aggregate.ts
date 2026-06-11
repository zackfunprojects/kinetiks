/**
 * B4 — pure aggregation for the agent-activity summary. Separated from
 * the data loaders so the narration math is unit-testable without a
 * database.
 */

export interface ActivityOracleRunRow {
  started_at: string;
  status: string;
  insights_written: number | null;
  sources_evaluated: string[] | null;
}

export interface ActivityLedgerRow {
  event_type: string;
}

export interface ActivityToolCallRow {
  tool_name: string;
}

/** D4 — an in-app alert row as the Activity panel renders it. */
export interface ActivityAlertRow {
  id: string;
  title: string;
  body: string;
  severity: string;
  read: boolean;
  created_at: string;
}

export interface AgentActivitySummary {
  window_hours: number;
  oracle: {
    runs: number;
    insights_written: number;
    sources_evaluated: string[];
    last_run_at: string | null;
  };
  archivist: {
    proposals_resolved: number;
    patterns_updated: number;
    decay_recalibrations: number;
    maintenance_events: number;
  };
  conversation: {
    turns: number;
    tool_calls: number;
    tools_used: string[];
  };
  authority: {
    actions_under_grants: number;
  };
  /** D4 — the in-app delivery channel (briefs, urgent alerts). */
  alerts: {
    unread_count: number;
    latest: ActivityAlertRow[];
  };
}

const PROPOSAL_EVENTS = new Set(["proposal_accepted", "proposal_declined"]);
const PATTERN_EVENTS = new Set([
  "pattern_observed",
  "pattern_arbitrated",
  "pattern_archived",
]);
const DECAY_EVENTS = new Set(["pattern_decay_calibrated"]);
const ARCHIVIST_MAINTENANCE_EVENTS = new Set([
  "archivist_clean",
  "archivist_cron_run",
  "archivist_dedup",
  "archivist_gap_detect",
  "archivist_normalize",
  "archivist_quality_score",
]);
const TURN_EVENTS = new Set(["marcus_turn"]);
const AUTHORITY_EVENTS = new Set(["authority_action_taken"]);

/**
 * The only ledger event types the summary reads. Exported so the loader
 * filters server-side instead of pulling the whole window.
 */
export const ACTIVITY_LEDGER_EVENT_TYPES: readonly string[] = [
  ...PROPOSAL_EVENTS,
  ...PATTERN_EVENTS,
  ...DECAY_EVENTS,
  ...ARCHIVIST_MAINTENANCE_EVENTS,
  ...TURN_EVENTS,
  ...AUTHORITY_EVENTS,
];

export interface AggregateActivityInput {
  windowHours: number;
  oracleRuns: ActivityOracleRunRow[];
  ledgerEvents: ActivityLedgerRow[];
  toolCalls: ActivityToolCallRow[];
  alerts: ActivityAlertRow[];
}

export function aggregateActivity(
  input: AggregateActivityInput,
): AgentActivitySummary {
  const { windowHours, oracleRuns, ledgerEvents, toolCalls, alerts } = input;

  const completedRuns = oracleRuns.filter((r) => r.status !== "running");
  const sources = new Set<string>();
  let insightsWritten = 0;
  for (const run of completedRuns) {
    insightsWritten += run.insights_written ?? 0;
    for (const source of run.sources_evaluated ?? []) sources.add(source);
  }
  const lastRunAt = oracleRuns.length > 0 ? oracleRuns[0].started_at : null;

  let proposalsResolved = 0;
  let patternsUpdated = 0;
  let decayRecalibrations = 0;
  let maintenanceEvents = 0;
  let turns = 0;
  let authorityActions = 0;
  for (const event of ledgerEvents) {
    if (PROPOSAL_EVENTS.has(event.event_type)) proposalsResolved += 1;
    else if (PATTERN_EVENTS.has(event.event_type)) patternsUpdated += 1;
    else if (DECAY_EVENTS.has(event.event_type)) decayRecalibrations += 1;
    else if (ARCHIVIST_MAINTENANCE_EVENTS.has(event.event_type)) maintenanceEvents += 1;
    else if (TURN_EVENTS.has(event.event_type)) turns += 1;
    else if (AUTHORITY_EVENTS.has(event.event_type)) authorityActions += 1;
  }

  const toolsUsed = [...new Set(toolCalls.map((t) => t.tool_name))];

  return {
    window_hours: windowHours,
    oracle: {
      runs: completedRuns.length,
      insights_written: insightsWritten,
      sources_evaluated: [...sources].sort(),
      last_run_at: lastRunAt,
    },
    archivist: {
      proposals_resolved: proposalsResolved,
      patterns_updated: patternsUpdated,
      decay_recalibrations: decayRecalibrations,
      maintenance_events: maintenanceEvents,
    },
    conversation: {
      turns,
      tool_calls: toolCalls.length,
      tools_used: toolsUsed.sort(),
    },
    authority: {
      actions_under_grants: authorityActions,
    },
    alerts: {
      unread_count: alerts.filter((a) => !a.read).length,
      latest: alerts,
    },
  };
}

/** True when nothing happened in the window (drives the empty state). */
export function isActivityEmpty(summary: AgentActivitySummary): boolean {
  return (
    summary.oracle.runs === 0 &&
    summary.oracle.insights_written === 0 &&
    summary.archivist.proposals_resolved === 0 &&
    summary.archivist.patterns_updated === 0 &&
    summary.archivist.decay_recalibrations === 0 &&
    summary.archivist.maintenance_events === 0 &&
    summary.conversation.turns === 0 &&
    summary.conversation.tool_calls === 0 &&
    summary.authority.actions_under_grants === 0 &&
    summary.alerts.latest.length === 0
  );
}
