import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  _resetActionClassRegistryForTests,
  _resetToolRegistryForTests,
  defineTool,
  registerActionClass,
  registerTool,
  type AgentTool,
} from "@kinetiks/tools";
import type { EscalationTrigger, GrantedCapability } from "@kinetiks/types";
import {
  _resetAuthorityAdaptersForTests,
  configureGrantReader,
  configureLedgerHistoryReader,
  configureMetricCacheReader,
  configureRecentActionCounter,
  configureUsageSummaryReader,
  defaultAuthorityResolver,
  type MatchedGrant,
  type ResolveAuthorityCtx,
} from "../index";

beforeEach(() => {
  _resetAuthorityAdaptersForTests();
  _resetActionClassRegistryForTests();
  _resetToolRegistryForTests();
});

afterEach(() => {
  _resetAuthorityAdaptersForTests();
  _resetActionClassRegistryForTests();
  _resetToolRegistryForTests();
});

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

function makeSlackTool(): AgentTool<{ message_length: number; channel: string }, { ok: boolean }> {
  const tool = defineTool({
    name: "send_slack_notification",
    description: "Send a Slack notification (test fixture)",
    inputSchema: z.object({ message_length: z.number(), channel: z.string() }),
    outputSchema: z.object({ ok: z.boolean() }),
    isConsequential: true,
    actionClass: "kinetiks_id.send_slack_notification",
    autoApproveThreshold: null,
    availability: { kind: "always" },
    idempotencyKeyFrom: (input: { channel: string; message_length: number }) =>
      `${input.channel}:${input.message_length}`,
    execute: async () => ({ ok: true }),
  });
  registerTool(tool);
  return tool;
}

function registerSlackActionClass() {
  registerActionClass({
    action_class: "kinetiks_id.send_slack_notification",
    source_app: "kinetiks_id",
    description:
      "Send a Slack notification on the customer's behalf for tests",
    constraint_schema: z.object({
      channels: z.union([z.array(z.string()), z.literal("any")]),
      max_message_length: z.number(),
    }),
    rate_limit_default: { count: 20, window: "day" },
    customer_template:
      "Send Slack notifications to {channels} on your behalf, up to {max_message_length} characters per message.",
    available_in_default_standing_grants: true,
    always_requires_budget_attachment: false,
  });
}

function makeGrant(over: Partial<MatchedGrant> = {}): MatchedGrant {
  const capability: GrantedCapability = {
    action_class: "kinetiks_id.send_slack_notification",
    description: "Send Slack notifications to #general",
    constraints: { channels: ["general"], max_message_length: 2000 },
    rate_limit: { count: 20, window: "day" },
  };
  return {
    id: "g_1",
    account_id: "acc_1",
    scope_type: "standing",
    scope_id: null,
    parent_grant_id: null,
    granted_at: new Date().toISOString(),
    expires_at: null,
    max_unapproved_spend_per_day: null,
    max_unapproved_spend_per_action: null,
    spending_currency: "USD",
    escalation_triggers: [],
    matched_capability: capability,
    ...over,
  };
}

function makeCtx(over: Partial<ResolveAuthorityCtx> = {}): ResolveAuthorityCtx {
  return {
    accountId: "acc_1",
    userId: "user_1",
    invokedByAgent: "marcus",
    threadId: null,
    actionInput: { channel: "general", message_length: 1500 },
    scopeType: "standing",
    scopeId: null,
    ...over,
  };
}

// ─────────────────────────────────────────────
// Outcomes
// ─────────────────────────────────────────────

describe("defaultAuthorityResolver", () => {
  it("returns auto_threshold for non-consequential tools", async () => {
    const readOnly = defineTool({
      name: "noop_read",
      description: "Read-only fixture",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      isConsequential: false,
      autoApproveThreshold: null,
      availability: { kind: "always" },
      execute: async () => ({}),
    });
    const result = await defaultAuthorityResolver(readOnly, makeCtx());
    expect(result.outcome).toBe("auto_threshold");
    expect(result.grantId).toBeNull();
  });

  it("returns auto_threshold when GrantReader is unconfigured", async () => {
    registerSlackActionClass();
    const tool = makeSlackTool();
    const result = await defaultAuthorityResolver(tool, makeCtx());
    expect(result.outcome).toBe("auto_threshold");
    expect(result.grantId).toBeNull();
  });

  it("returns auto_threshold when no grant covers the action class", async () => {
    registerSlackActionClass();
    const tool = makeSlackTool();
    configureGrantReader({
      async findCoveringGrant() {
        return null;
      },
    });
    const result = await defaultAuthorityResolver(tool, makeCtx());
    expect(result.outcome).toBe("auto_threshold");
    expect(result.grantId).toBeNull();
  });

  it("returns grant_covers when a valid grant covers the action", async () => {
    registerSlackActionClass();
    const tool = makeSlackTool();
    configureGrantReader({
      async findCoveringGrant() {
        return makeGrant();
      },
    });
    const result = await defaultAuthorityResolver(tool, makeCtx());
    expect(result.outcome).toBe("grant_covers");
    expect(result.grantId).toBe("g_1");
    expect(result.matchedCapability?.action_class).toBe(
      "kinetiks_id.send_slack_notification",
    );
  });

  it("returns escalated 'constraint_failed' when input violates allowlist", async () => {
    registerSlackActionClass();
    const tool = makeSlackTool();
    configureGrantReader({
      async findCoveringGrant() {
        return makeGrant();
      },
    });
    const result = await defaultAuthorityResolver(
      tool,
      makeCtx({
        // Constraint allows ["general"]; the inbound channels payload
        // (matching the action class schema field name `channels`)
        // includes "secret-team", which is not in the allowlist.
        actionInput: { channels: ["secret-team"], message_length: 100 },
      }),
    );
    expect(result.outcome).toBe("escalated");
    expect(result.grantId).toBe("g_1");
    expect(result.reason?.code).toBe("constraint_failed");
  });

  it("returns escalated 'constraint_failed' when input exceeds numeric cap", async () => {
    registerSlackActionClass();
    const tool = makeSlackTool();
    configureGrantReader({
      async findCoveringGrant() {
        return makeGrant();
      },
    });
    const result = await defaultAuthorityResolver(
      tool,
      makeCtx({
        // constraints.max_message_length=2000 caps action_input.message_length
        actionInput: { channel: "general", message_length: 9999 },
      }),
    );
    expect(result.outcome).toBe("escalated");
    expect(result.reason?.code).toBe("constraint_failed");
  });

  it("returns escalated 'rate_limited' when grant rate_limit is exceeded", async () => {
    registerSlackActionClass();
    const tool = makeSlackTool();
    configureGrantReader({
      async findCoveringGrant() {
        return makeGrant();
      },
    });
    configureRecentActionCounter({
      async countRecent() {
        return 25; // exceeds rate_limit.count of 20
      },
    });
    const result = await defaultAuthorityResolver(tool, makeCtx());
    expect(result.outcome).toBe("escalated");
    expect(result.reason?.code).toBe("rate_limited");
  });

  it("returns escalated when a trigger fires", async () => {
    registerSlackActionClass();
    const tool = makeSlackTool();
    const triggers: EscalationTrigger[] = [
      {
        type: "threshold",
        description: "Escalate when message_length > 1000",
        condition: { parameter_name: "message_length", operator: "gt", value: 1000 },
      },
    ];
    configureGrantReader({
      async findCoveringGrant() {
        return makeGrant({ escalation_triggers: triggers });
      },
    });
    const result = await defaultAuthorityResolver(tool, makeCtx());
    expect(result.outcome).toBe("escalated");
    expect(result.reason?.code).toBe("trigger_fired");
    expect(result.reason?.trigger_type).toBe("threshold");
  });

  it("returns denied when a spend-bearing action class has no envelope on the grant", async () => {
    registerActionClass({
      action_class: "kinetiks_id.fixture_spend",
      source_app: "kinetiks_id",
      description: "Test fixture: a spend-bearing action class",
      constraint_schema: z.object({}),
      rate_limit_default: null,
      customer_template: "Spend funds on your behalf.",
      available_in_default_standing_grants: false,
      always_requires_budget_attachment: true,
    });
    const spendTool = defineTool({
      name: "fixture_spend",
      description: "Spend test fixture",
      inputSchema: z.object({ spend_amount: z.number() }),
      outputSchema: z.object({}),
      isConsequential: true,
      actionClass: "kinetiks_id.fixture_spend",
      autoApproveThreshold: null,
      availability: { kind: "always" },
      idempotencyKeyFrom: (input: { spend_amount: number }) => String(input.spend_amount),
      execute: async () => ({}),
    });
    registerTool(spendTool);
    configureGrantReader({
      async findCoveringGrant() {
        return {
          ...makeGrant({
            matched_capability: {
              action_class: "kinetiks_id.fixture_spend",
              description: "Fixture spend cap",
              constraints: {},
              rate_limit: null,
            },
          }),
          max_unapproved_spend_per_day: null,
          max_unapproved_spend_per_action: null,
        };
      },
    });
    const result = await defaultAuthorityResolver(
      spendTool,
      makeCtx({ actionInput: { spend_amount: 100 } }),
    );
    expect(result.outcome).toBe("denied");
    expect(result.reason?.code).toBe("missing_budget");
  });

  it("returns escalated 'envelope_exceeded' when spend exceeds per-action cap", async () => {
    registerActionClass({
      action_class: "kinetiks_id.fixture_spend",
      source_app: "kinetiks_id",
      description: "Test fixture: a spend-bearing action class",
      constraint_schema: z.object({}),
      rate_limit_default: null,
      customer_template: "Spend funds on your behalf.",
      available_in_default_standing_grants: false,
      always_requires_budget_attachment: true,
    });
    const spendTool = defineTool({
      name: "fixture_spend",
      description: "Spend test fixture",
      inputSchema: z.object({ spend_amount: z.number() }),
      outputSchema: z.object({}),
      isConsequential: true,
      actionClass: "kinetiks_id.fixture_spend",
      autoApproveThreshold: null,
      availability: { kind: "always" },
      idempotencyKeyFrom: (input: { spend_amount: number }) => String(input.spend_amount),
      execute: async () => ({}),
    });
    registerTool(spendTool);
    configureGrantReader({
      async findCoveringGrant() {
        return {
          ...makeGrant({
            matched_capability: {
              action_class: "kinetiks_id.fixture_spend",
              description: "Fixture spend cap",
              constraints: {},
              rate_limit: null,
            },
          }),
          max_unapproved_spend_per_action: 5,
          max_unapproved_spend_per_day: 100,
        };
      },
    });
    const result = await defaultAuthorityResolver(
      spendTool,
      makeCtx({ actionInput: { spend_amount: 10 } }),
    );
    expect(result.outcome).toBe("escalated");
    expect(result.reason?.code).toBe("envelope_exceeded");
  });

  it("does NOT enforce envelope when the action class is non-spend-bearing", async () => {
    registerSlackActionClass();
    const tool = makeSlackTool();
    configureGrantReader({
      async findCoveringGrant() {
        // grant has no envelope, but Slack is not spend-bearing
        return makeGrant({
          max_unapproved_spend_per_day: null,
          max_unapproved_spend_per_action: null,
        });
      },
    });
    const result = await defaultAuthorityResolver(tool, makeCtx());
    expect(result.outcome).toBe("grant_covers");
  });
});

// ─────────────────────────────────────────────
// Constraint narrowing helper unit tests
// ─────────────────────────────────────────────

describe("validateActionAgainstConstraints (indirect via resolver)", () => {
  beforeEach(() => {
    registerSlackActionClass();
  });

  it("treats 'any' sentinel as pass-through", async () => {
    const tool = makeSlackTool();
    configureGrantReader({
      async findCoveringGrant() {
        return makeGrant({
          matched_capability: {
            action_class: "kinetiks_id.send_slack_notification",
            description: "any-channel grant",
            constraints: { channels: "any", max_message_length: 2000 },
            rate_limit: null,
          },
        });
      },
    });
    const result = await defaultAuthorityResolver(tool, makeCtx());
    expect(result.outcome).toBe("grant_covers");
  });
});
