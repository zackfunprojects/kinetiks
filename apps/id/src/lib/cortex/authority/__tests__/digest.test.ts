import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  _resetActionClassRegistryForTests,
  registerActionClass,
} from "@kinetiks/tools";

import {
  renderAuthorityActivityBlock,
  JUDGMENT_BUDGET_PRESSURE_THRESHOLD,
} from "../digest";

beforeEach(() => {
  _resetActionClassRegistryForTests();
});
afterEach(() => {
  _resetActionClassRegistryForTests();
});

function registerBudgetedClass(daily_usd = 5) {
  registerActionClass({
    action_class: "kinetiks_id.fixture_judged",
    source_app: "kinetiks_id",
    description: "Test fixture with an LLM judgment budget.",
    constraint_schema: z.object({}),
    rate_limit_default: null,
    customer_template: "Do the judged thing.",
    available_in_default_standing_grants: false,
    always_requires_budget_attachment: false,
    llm_judgment_budget: {
      daily_usd,
      monthly_usd: daily_usd * 20,
      model: "haiku",
      fallback_on_budget_exhausted: "escalate_to_user",
    },
  });
}

const ACTIVE_GRANT = {
  id: "g_1",
  status: "active",
  scope_description: "Acme Q1 LinkedIn Campaign",
};

describe("renderAuthorityActivityBlock", () => {
  it("returns null when the account has no authority surface", () => {
    expect(
      renderAuthorityActivityBlock({
        grants: [],
        windowEvents: [],
        judgmentSpendToday: [],
      }),
    ).toBeNull();
  });

  it("summarizes grants, actions, spend, and escalations in plain language", () => {
    const block = renderAuthorityActivityBlock({
      grants: [
        ACTIVE_GRANT,
        { id: "g_2", status: "paused", scope_description: "Standing Slack notifications" },
      ],
      windowEvents: [
        {
          event_type: "authority_action_taken",
          detail: { action_class: "kinetiks_id.send_slack_notification" },
        },
        {
          event_type: "authority_action_taken",
          detail: {
            action_class: "kinetiks_id.fixture_spend",
            spend_amount: 12.5,
            spend_currency: "USD",
          },
        },
        {
          event_type: "authority_action_escalated",
          detail: { reason_code: "rate_limited" },
        },
      ],
      judgmentSpendToday: [],
    });
    expect(block).not.toBeNull();
    expect(block).toContain("Active permissions: 1 (Acme Q1 LinkedIn Campaign)");
    expect(block).toContain("Paused permissions: 1");
    expect(block).toContain("Actions taken under permissions this period: 2");
    expect(block).toContain("spend under permissions: $12.50");
    expect(block).toContain("Escalations routed to approval this period: 1");
    expect(block).toContain("rate limited");
    // Customer-language rule holds even for prompt input.
    expect(block).not.toMatch(/authority\s+grant/i);
  });

  it("reports 'none' for a live grant with a quiet window", () => {
    const block = renderAuthorityActivityBlock({
      grants: [ACTIVE_GRANT],
      windowEvents: [],
      judgmentSpendToday: [],
    });
    expect(block).toContain("Actions taken under permissions this period: none");
  });

  it("raises the §2.10 budget-pressure callout at the threshold", () => {
    registerBudgetedClass(5);
    const spent = 5 * JUDGMENT_BUDGET_PRESSURE_THRESHOLD;
    const block = renderAuthorityActivityBlock({
      grants: [ACTIVE_GRANT],
      windowEvents: [],
      judgmentSpendToday: [
        { task: "authority.llm_judged.kinetiks_id.fixture_judged", cost_usd: spent },
      ],
    });
    expect(block).toContain("Review-budget pressure");
    expect(block).toContain("kinetiks_id.fixture_judged");
    expect(block).toContain("$4.00 of its $5.00/day");
  });

  it("flags over-budget classes with the declared fallback", () => {
    registerBudgetedClass(5);
    const block = renderAuthorityActivityBlock({
      grants: [ACTIVE_GRANT],
      windowEvents: [],
      judgmentSpendToday: [
        { task: "authority.llm_judged.kinetiks_id.fixture_judged", cost_usd: 6 },
      ],
    });
    expect(block).toContain("over budget");
    expect(block).toContain("escalate to you");
  });

  it("stays quiet about classes under the pressure threshold", () => {
    registerBudgetedClass(5);
    const block = renderAuthorityActivityBlock({
      grants: [ACTIVE_GRANT],
      windowEvents: [],
      judgmentSpendToday: [
        { task: "authority.llm_judged.kinetiks_id.fixture_judged", cost_usd: 1 },
      ],
    });
    expect(block).not.toContain("Review-budget pressure");
  });
});
