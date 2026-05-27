import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  _resetActionClassRegistryForTests,
  registerActionClass,
} from "@kinetiks/tools";
import type { EscalationTrigger } from "@kinetiks/types";
import {
  _resetAuthorityAdaptersForTests,
  configureJudgmentBudgetAdapter,
  configureLedgerHistoryReader,
  configureLLMJudge,
  configureMetricCacheReader,
  configureRecentActionCounter,
  configureUsageSummaryReader,
  evaluateEscalationTriggers,
} from "../index";

beforeEach(() => {
  _resetAuthorityAdaptersForTests();
  _resetActionClassRegistryForTests();
});

afterEach(() => {
  _resetAuthorityAdaptersForTests();
  _resetActionClassRegistryForTests();
});

const ctx = {
  account_id: "acc_1",
  action_class: "kinetiks_id.send_slack_notification",
  action_input: { message_length: 1500, channel: "general" },
  grant_id: "g_1",
};

// ─────────────────────────────────────────────
// threshold
// ─────────────────────────────────────────────

describe("threshold trigger", () => {
  it("fires when action_input field exceeds the configured threshold", async () => {
    const triggers: EscalationTrigger[] = [
      {
        type: "threshold",
        description: "Escalate when message_length > 1000",
        condition: { parameter_name: "message_length", operator: "gt", value: 1000 },
      },
    ];
    const result = await evaluateEscalationTriggers(triggers, ctx);
    expect(result.triggered).toBe(true);
    if (result.triggered) {
      expect(result.type).toBe("threshold");
      expect(result.trigger_index).toBe(0);
    }
  });

  it("does not fire when action_input field is within the threshold", async () => {
    const triggers: EscalationTrigger[] = [
      {
        type: "threshold",
        description: "Escalate when message_length > 5000",
        condition: { parameter_name: "message_length", operator: "gt", value: 5000 },
      },
    ];
    const result = await evaluateEscalationTriggers(triggers, ctx);
    expect(result.triggered).toBe(false);
  });

  it("does not fire when the action_input field is non-numeric", async () => {
    const triggers: EscalationTrigger[] = [
      {
        type: "threshold",
        description: "no-op",
        condition: { parameter_name: "channel", operator: "eq", value: 0 },
      },
    ];
    const result = await evaluateEscalationTriggers(triggers, ctx);
    expect(result.triggered).toBe(false);
  });
});

// ─────────────────────────────────────────────
// pacing
// ─────────────────────────────────────────────

describe("pacing trigger", () => {
  it("fires when usage_summary action count meets the day cap", async () => {
    configureUsageSummaryReader({
      async fetchUsageSummary() {
        return {
          action_counts: { "kinetiks_id.send_slack_notification": 25 },
          last_computed_at: new Date().toISOString(),
        };
      },
    });
    const triggers: EscalationTrigger[] = [
      {
        type: "pacing",
        description: "Cap 20/day",
        condition: { window: "day", max_actions: 20 },
      },
    ];
    const result = await evaluateEscalationTriggers(triggers, ctx);
    expect(result.triggered).toBe(true);
  });

  it("falls back to live counter for sub-day windows", async () => {
    configureRecentActionCounter({
      async countRecent({ window_ms }) {
        // 1-hour window → 100 actions
        return window_ms === 60 * 60 * 1000 ? 100 : 0;
      },
    });
    const triggers: EscalationTrigger[] = [
      {
        type: "pacing",
        description: "Cap 50/hour",
        condition: { window: "hour", max_actions: 50 },
      },
    ];
    const result = await evaluateEscalationTriggers(triggers, ctx);
    expect(result.triggered).toBe(true);
    if (result.triggered) expect(result.type).toBe("pacing");
  });

  it("does not fire when adapter is unconfigured (graceful degradation)", async () => {
    const triggers: EscalationTrigger[] = [
      {
        type: "pacing",
        description: "Cap 5/minute",
        condition: { window: "minute", max_actions: 5 },
      },
    ];
    const result = await evaluateEscalationTriggers(triggers, ctx);
    expect(result.triggered).toBe(false);
  });
});

// ─────────────────────────────────────────────
// novelty
// ─────────────────────────────────────────────

describe("novelty trigger", () => {
  it("fires when input differs from historical centroid", async () => {
    configureLedgerHistoryReader({
      async fetchActionHistory() {
        // History centroid hovers around message_length=200; inbound is 1500.
        return Array.from({ length: 10 }, () => ({
          action_input_summary: { message_length: 200 },
          created_at: new Date().toISOString(),
        }));
      },
    });
    const triggers: EscalationTrigger[] = [
      {
        type: "novelty",
        description: "Escalate when far from typical",
        condition: { similarity_threshold: 0.1, min_history: 5 },
      },
    ];
    const result = await evaluateEscalationTriggers(triggers, ctx);
    expect(result.triggered).toBe(true);
    if (result.triggered) expect(result.type).toBe("novelty");
  });

  it("does not fire when history is below min_history", async () => {
    configureLedgerHistoryReader({
      async fetchActionHistory() {
        return [
          { action_input_summary: { message_length: 200 }, created_at: "" },
          { action_input_summary: { message_length: 250 }, created_at: "" },
        ];
      },
    });
    const triggers: EscalationTrigger[] = [
      {
        type: "novelty",
        description: "Escalate when far from typical",
        condition: { similarity_threshold: 0.1, min_history: 5 },
      },
    ];
    const result = await evaluateEscalationTriggers(triggers, ctx);
    expect(result.triggered).toBe(false);
  });
});

// ─────────────────────────────────────────────
// anomaly
// ─────────────────────────────────────────────

describe("anomaly trigger", () => {
  it("fires when z-score exceeds threshold", async () => {
    configureMetricCacheReader({
      async fetchMetricStats() {
        return { mean: 100, stddev: 10, latest: 150 }; // z = 5
      },
    });
    const triggers: EscalationTrigger[] = [
      {
        type: "anomaly",
        description: "Escalate on metric anomaly",
        condition: { metric: "ga4_sessions", zscore_threshold: 3 },
      },
    ];
    const result = await evaluateEscalationTriggers(triggers, ctx);
    expect(result.triggered).toBe(true);
    if (result.triggered) expect(result.type).toBe("anomaly");
  });

  it("does not fire when metric is not cached", async () => {
    configureMetricCacheReader({
      async fetchMetricStats() {
        return null;
      },
    });
    const triggers: EscalationTrigger[] = [
      {
        type: "anomaly",
        description: "no-op",
        condition: { metric: "ga4_sessions", zscore_threshold: 3 },
      },
    ];
    const result = await evaluateEscalationTriggers(triggers, ctx);
    expect(result.triggered).toBe(false);
  });
});

// ─────────────────────────────────────────────
// llm_judged
// ─────────────────────────────────────────────

describe("llm_judged trigger", () => {
  it("fires when judge returns confidence below threshold", async () => {
    registerActionClass({
      action_class: "kinetiks_id.send_slack_notification",
      source_app: "kinetiks_id",
      description: "Test send slack notification descriptor",
      constraint_schema: z.object({}),
      rate_limit_default: null,
      customer_template: "Send a notification.",
      available_in_default_standing_grants: true,
      always_requires_budget_attachment: false,
    });
    configureLLMJudge({
      async judge() {
        return { confidence: 0.2 };
      },
    });
    const triggers: EscalationTrigger[] = [
      {
        type: "llm_judged",
        description: "Escalate if LLM doubts",
        condition: { prompt_task: "judge.send_slack", confidence_threshold: 0.6 },
      },
    ];
    const result = await evaluateEscalationTriggers(triggers, ctx);
    expect(result.triggered).toBe(true);
    if (result.triggered) expect(result.type).toBe("llm_judged");
  });

  it("with budget exhausted + escalate_to_user fallback, treats trigger as fired", async () => {
    registerActionClass({
      action_class: "kinetiks_id.send_slack_notification",
      source_app: "kinetiks_id",
      description: "Test send slack notification descriptor",
      constraint_schema: z.object({}),
      rate_limit_default: null,
      customer_template: "Send a notification.",
      available_in_default_standing_grants: true,
      always_requires_budget_attachment: false,
      llm_judgment_budget: {
        daily_usd: 1.0,
        monthly_usd: 20.0,
        model: "haiku",
        fallback_on_budget_exhausted: "escalate_to_user",
      },
    });
    configureJudgmentBudgetAdapter({
      async getSpend() {
        return 1.5; // exceeds daily cap of 1.0
      },
    });
    configureLLMJudge({
      async judge() {
        return { confidence: 1.0 };
      },
    });
    const triggers: EscalationTrigger[] = [
      {
        type: "llm_judged",
        description: "Escalate if LLM doubts",
        condition: { prompt_task: "judge.send_slack", confidence_threshold: 0.6 },
      },
    ];
    const result = await evaluateEscalationTriggers(triggers, ctx);
    expect(result.triggered).toBe(true);
    if (result.triggered) {
      expect(result.type).toBe("llm_judged");
      expect(result.reason).toMatch(/budget exhausted/);
    }
  });

  it("with budget exhausted + structured_only fallback, treats trigger as not-fired", async () => {
    registerActionClass({
      action_class: "kinetiks_id.send_slack_notification",
      source_app: "kinetiks_id",
      description: "Test send slack notification descriptor",
      constraint_schema: z.object({}),
      rate_limit_default: null,
      customer_template: "Send a notification.",
      available_in_default_standing_grants: true,
      always_requires_budget_attachment: false,
      llm_judgment_budget: {
        daily_usd: 1.0,
        monthly_usd: 20.0,
        model: "haiku",
        fallback_on_budget_exhausted: "structured_only",
      },
    });
    configureJudgmentBudgetAdapter({
      async getSpend() {
        return 1.5; // exceeds cap
      },
    });
    const triggers: EscalationTrigger[] = [
      {
        type: "llm_judged",
        description: "Escalate if LLM doubts",
        condition: { prompt_task: "judge.send_slack", confidence_threshold: 0.6 },
      },
    ];
    const result = await evaluateEscalationTriggers(triggers, ctx);
    expect(result.triggered).toBe(false);
  });
});

// ─────────────────────────────────────────────
// ordering + short-circuit
// ─────────────────────────────────────────────

describe("cost ordering", () => {
  it("evaluates cheapest triggers first and short-circuits on the first fired", async () => {
    let novelty_called = 0;
    configureLedgerHistoryReader({
      async fetchActionHistory() {
        novelty_called += 1;
        return [];
      },
    });
    const triggers: EscalationTrigger[] = [
      // Novelty (expensive) listed first in the array; threshold listed
      // second. The evaluator should run threshold FIRST (cost-ordered)
      // and short-circuit on its fire — never invoking novelty.
      {
        type: "novelty",
        description: "expensive",
        condition: { similarity_threshold: 0.1, min_history: 5 },
      },
      {
        type: "threshold",
        description: "cheap",
        condition: { parameter_name: "message_length", operator: "gt", value: 100 },
      },
    ];
    const result = await evaluateEscalationTriggers(triggers, ctx);
    expect(result.triggered).toBe(true);
    if (result.triggered) {
      expect(result.type).toBe("threshold");
      // Returned trigger_index points at the ORIGINAL input position,
      // not the cost-sorted position.
      expect(result.trigger_index).toBe(1);
    }
    expect(novelty_called).toBe(0); // expensive trigger never invoked
  });
});
