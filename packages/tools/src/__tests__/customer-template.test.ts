import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  _resetActionClassRegistryForTests,
  registerActionClass,
  renderCustomerSentence,
  ToolError,
} from "../index";

afterEach(() => {
  _resetActionClassRegistryForTests();
});

describe("renderCustomerSentence", () => {
  it("renders a sentence with placeholder substitution", () => {
    registerActionClass({
      action_class: "implosion.adjust_bid",
      source_app: "implosion",
      description: "Adjust the auction bid for a running ad set",
      constraint_schema: z.object({ max_pct_change: z.number().min(1).max(100) }),
      rate_limit_default: { count: 30, window: "hour" },
      customer_template: "Adjust bids up or down by up to {max_pct_change}% at a time.",
      available_in_default_standing_grants: false,
      always_requires_budget_attachment: true,
    });
    const out = renderCustomerSentence("implosion.adjust_bid", { max_pct_change: 25 });
    expect(out).toBe("Adjust bids up or down by up to 25% at a time.");
  });

  it("throws when constraints fail the schema", () => {
    registerActionClass({
      action_class: "implosion.adjust_bid",
      source_app: "implosion",
      description: "Adjust the auction bid for a running ad set",
      constraint_schema: z.object({ max_pct_change: z.number().min(1).max(100) }),
      rate_limit_default: null,
      customer_template: "Adjust bids by up to {max_pct_change}%.",
      available_in_default_standing_grants: false,
      always_requires_budget_attachment: true,
    });
    expect(() =>
      renderCustomerSentence("implosion.adjust_bid", { max_pct_change: 500 }),
    ).toThrow(ToolError);
  });

  it("throws when action class is unregistered", () => {
    expect(() => renderCustomerSentence("nothing.here", {})).toThrow(/Unknown action class/);
  });
});
