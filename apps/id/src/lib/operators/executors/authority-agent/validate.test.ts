import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  _resetActionClassRegistryForTests,
  registerActionClass,
} from "@kinetiks/tools";
import type {
  GrantProposalEnvelope,
  GrantProposalEnvelopeMember,
} from "@kinetiks/types";

import { validateEnvelope, type BudgetValidationContext } from "./validate";

const INVOCATION_ID = "33333333-3333-3333-3333-333333333333";
const ROOT_GRANT_ID = "44444444-4444-4444-4444-444444444444";
const CHILD_GRANT_ID = "55555555-5555-5555-5555-555555555555";

beforeEach(() => {
  _resetActionClassRegistryForTests();
  registerActionClass({
    action_class: "kinetiks_id.send_slack_notification",
    source_app: "kinetiks_id",
    description: "Send a Slack notification on behalf of the customer (test fixture).",
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
  registerActionClass({
    action_class: "kinetiks_id.fixture_spend",
    source_app: "kinetiks_id",
    description: "Test fixture: a spend-bearing action class.",
    constraint_schema: z.object({}),
    rate_limit_default: null,
    customer_template: "Spend funds on your behalf.",
    available_in_default_standing_grants: false,
    always_requires_budget_attachment: true,
  });
});

afterEach(() => {
  _resetActionClassRegistryForTests();
});

type GrantPayload = GrantProposalEnvelopeMember["grant"];

function slackGrant(over: Partial<GrantPayload> = {}): GrantPayload {
  return {
    scope_type: "campaign",
    scope_id: "c_1",
    scope_description: "Acme Q1 Launch",
    parent_grant_id: null,
    granted_capabilities: [
      {
        action_class: "kinetiks_id.send_slack_notification",
        description: "Send Slack notifications about the launch.",
        constraints: { channels: ["acme-team"], max_message_length: 2000 },
        rate_limit: { count: 10, window: "day" },
      },
    ],
    escalation_triggers: [],
    max_unapproved_spend_per_day: null,
    max_unapproved_spend_per_action: null,
    spending_currency: "USD",
    budget_category: null,
    expires_at: null,
    ...over,
  } as GrantPayload;
}

function spendGrant(over: Partial<GrantPayload> = {}): GrantPayload {
  return slackGrant({
    granted_capabilities: [
      {
        action_class: "kinetiks_id.fixture_spend",
        description: "Spend on the launch campaign within the cap.",
        constraints: {},
        rate_limit: null,
      },
    ],
    max_unapproved_spend_per_day: 100,
    max_unapproved_spend_per_action: 50,
    budget_category: "advertising",
    ...over,
  });
}

function envelope(
  members: Array<{ grant_id: string; grant: GrantPayload }>,
): GrantProposalEnvelope {
  return {
    invocation_id: INVOCATION_ID,
    request_type: "campaign_launch",
    proposed_grants: members.map((m) => ({
      grant_id: m.grant_id,
      grant: m.grant,
      reasoning:
        "Validation fixture reasoning that comfortably exceeds the forty character floor.",
      evidence: {
        patterns_referenced: [],
        similar_past_grants: [],
        ledger_summary: {
          proposals_last_90d: 0,
          approval_rate: 0,
          most_common_edit_type: null,
        },
        identity_signals: [],
      },
    })) as unknown as GrantProposalEnvelope["proposed_grants"],
  };
}

const BUDGET: BudgetValidationContext = {
  remaining_by_category: { advertising: 500, content: 80 },
};

describe("validateEnvelope — check 6 (spend envelope ≤ Budget category)", () => {
  it("passes a non-spend grant with no budget context", () => {
    const res = validateEnvelope(envelope([{ grant_id: ROOT_GRANT_ID, grant: slackGrant() }]));
    expect(res.ok).toBe(true);
  });

  it("flags per-action cap exceeding per-day cap even on non-spend grants", () => {
    const res = validateEnvelope(
      envelope([
        {
          grant_id: ROOT_GRANT_ID,
          grant: slackGrant({
            max_unapproved_spend_per_day: 10,
            max_unapproved_spend_per_action: 20,
          }),
        },
      ]),
    );
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toContain("max_unapproved_spend_per_action");
  });

  it("requires budget_category on spend-bearing grants", () => {
    const res = validateEnvelope(
      envelope([{ grant_id: ROOT_GRANT_ID, grant: spendGrant({ budget_category: null }) }]),
    );
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toContain("budget_category is required");
  });

  it("requires a spending envelope on spend-bearing grants", () => {
    const res = validateEnvelope(
      envelope([
        {
          grant_id: ROOT_GRANT_ID,
          grant: spendGrant({
            max_unapproved_spend_per_day: null,
            max_unapproved_spend_per_action: null,
          }),
        },
      ]),
    );
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toContain("spending envelope");
  });

  it("passes structural checks without a budget context (narrow path)", () => {
    const res = validateEnvelope(envelope([{ grant_id: ROOT_GRANT_ID, grant: spendGrant() }]));
    expect(res.ok).toBe(true);
  });

  it("rejects spend authority when the account has no active Budget", () => {
    const res = validateEnvelope(
      envelope([{ grant_id: ROOT_GRANT_ID, grant: spendGrant() }]),
      { remaining_by_category: null },
    );
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toContain("no active Budget");
  });

  it("rejects a budget_category that matches no allocation, naming the known ones", () => {
    const res = validateEnvelope(
      envelope([
        { grant_id: ROOT_GRANT_ID, grant: spendGrant({ budget_category: "mystery" }) },
      ]),
      BUDGET,
    );
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toContain('"mystery" does not match');
    expect(res.errors.join("\n")).toContain("advertising");
  });

  it("rejects caps exceeding the category's remaining allocation", () => {
    const perDay = validateEnvelope(
      envelope([
        {
          grant_id: ROOT_GRANT_ID,
          grant: spendGrant({
            budget_category: "content",
            max_unapproved_spend_per_day: 90,
            max_unapproved_spend_per_action: 10,
          }),
        },
      ]),
      BUDGET,
    );
    expect(perDay.ok).toBe(false);
    expect(perDay.errors.join("\n")).toContain("exceeds the remaining allocation (80)");

    const perAction = validateEnvelope(
      envelope([
        {
          grant_id: ROOT_GRANT_ID,
          grant: spendGrant({
            budget_category: "content",
            max_unapproved_spend_per_day: null,
            max_unapproved_spend_per_action: 81,
          }),
        },
      ]),
      BUDGET,
    );
    expect(perAction.ok).toBe(false);
    expect(perAction.errors.join("\n")).toContain("max_unapproved_spend_per_action (81)");
  });

  it("passes a spend grant that fits inside its category", () => {
    const res = validateEnvelope(
      envelope([{ grant_id: ROOT_GRANT_ID, grant: spendGrant() }]),
      BUDGET,
    );
    expect(res.ok).toBe(true);
  });

  it("rejects a child whose budget_category differs from the parent's", () => {
    const res = validateEnvelope(
      envelope([
        { grant_id: ROOT_GRANT_ID, grant: spendGrant() },
        {
          grant_id: CHILD_GRANT_ID,
          grant: spendGrant({
            parent_grant_id: ROOT_GRANT_ID,
            budget_category: "content",
            max_unapproved_spend_per_day: 50,
            max_unapproved_spend_per_action: 25,
            scope_type: "workflow",
            expires_at: null,
          }),
        },
      ]),
      BUDGET,
    );
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toContain('must match the parent\'s ("advertising")');
  });
});
