import { describe, expect, it } from "vitest";
import {
  ACTIVITY_LEDGER_EVENT_TYPES,
  aggregateActivity,
  isActivityEmpty,
} from "./aggregate";

const emptyInput = {
  windowHours: 24,
  oracleRuns: [],
  ledgerEvents: [],
  toolCalls: [],
  alerts: [],
};

describe("aggregateActivity", () => {
  it("produces an all-zero summary from no rows", () => {
    const summary = aggregateActivity(emptyInput);
    expect(summary.window_hours).toBe(24);
    expect(summary.oracle.runs).toBe(0);
    expect(summary.oracle.last_run_at).toBeNull();
    expect(summary.archivist.proposals_resolved).toBe(0);
    expect(summary.conversation.turns).toBe(0);
    expect(summary.authority.actions_under_grants).toBe(0);
    expect(summary.alerts.unread_count).toBe(0);
    expect(isActivityEmpty(summary)).toBe(true);
  });

  it("counts unread alerts and keeps the panel non-empty while any exist (D4)", () => {
    const alert = {
      id: "al-1",
      title: "Daily Brief",
      body: "Pipeline steady.",
      severity: "info",
      read: false,
      created_at: "2026-06-11T08:00:00Z",
    };
    const summary = aggregateActivity({
      ...emptyInput,
      alerts: [alert, { ...alert, id: "al-2", read: true }],
    });
    expect(summary.alerts.unread_count).toBe(1);
    expect(summary.alerts.latest).toHaveLength(2);
    expect(isActivityEmpty(summary)).toBe(false);
  });

  it("aggregates oracle runs: counts, insights, distinct sources, last run", () => {
    const summary = aggregateActivity({
      ...emptyInput,
      oracleRuns: [
        {
          started_at: "2026-06-10T06:00:00Z",
          status: "succeeded",
          insights_written: 2,
          sources_evaluated: ["ga4", "gsc"],
        },
        {
          started_at: "2026-06-09T18:00:00Z",
          status: "succeeded",
          insights_written: 1,
          sources_evaluated: ["ga4", "stripe"],
        },
        {
          started_at: "2026-06-09T12:00:00Z",
          status: "running",
          insights_written: 0,
          sources_evaluated: [],
        },
      ],
    });

    // The in-flight run is excluded from counts but not from recency.
    expect(summary.oracle.runs).toBe(2);
    expect(summary.oracle.insights_written).toBe(3);
    expect(summary.oracle.sources_evaluated).toEqual(["ga4", "gsc", "stripe"]);
    expect(summary.oracle.last_run_at).toBe("2026-06-10T06:00:00Z");
    expect(isActivityEmpty(summary)).toBe(false);
  });

  it("buckets ledger events by operator concern", () => {
    const summary = aggregateActivity({
      ...emptyInput,
      ledgerEvents: [
        { event_type: "proposal_accepted" },
        { event_type: "proposal_declined" },
        { event_type: "pattern_observed" },
        { event_type: "pattern_arbitrated" },
        { event_type: "pattern_archived" },
        { event_type: "pattern_decay_calibrated" },
        { event_type: "archivist_dedup" },
        { event_type: "marcus_turn" },
        { event_type: "marcus_turn" },
        { event_type: "authority_action_taken" },
      ],
    });

    expect(summary.archivist.proposals_resolved).toBe(2);
    expect(summary.archivist.patterns_updated).toBe(3);
    expect(summary.archivist.decay_recalibrations).toBe(1);
    expect(summary.archivist.maintenance_events).toBe(1);
    expect(summary.conversation.turns).toBe(2);
    expect(summary.authority.actions_under_grants).toBe(1);
  });

  it("counts tool calls and distinct tools", () => {
    const summary = aggregateActivity({
      ...emptyInput,
      toolCalls: [
        { tool_name: "ga4_query" },
        { tool_name: "ga4_query" },
        { tool_name: "stripe_query" },
      ],
    });

    expect(summary.conversation.tool_calls).toBe(3);
    expect(summary.conversation.tools_used).toEqual(["ga4_query", "stripe_query"]);
  });

  it("every bucketed event type appears in the loader filter list", () => {
    // Guards against a bucket silently going dark because the loader
    // stopped fetching its event type.
    for (const eventType of [
      "proposal_accepted",
      "pattern_observed",
      "pattern_decay_calibrated",
      "archivist_cron_run",
      "marcus_turn",
      "authority_action_taken",
    ]) {
      expect(ACTIVITY_LEDGER_EVENT_TYPES).toContain(eventType);
    }
  });
});
