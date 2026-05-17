import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  _resetActionClassRegistryForTests,
  assertActionClass,
  getActionClass,
  listActionClasses,
  listActionClassesForApp,
  registerActionClass,
  ToolError,
} from "../index";
import type { ActionClassDescriptor } from "@kinetiks/types";

afterEach(() => {
  _resetActionClassRegistryForTests();
});

const validClass = (): ActionClassDescriptor => ({
  action_class: "noop.send_email",
  source_app: "noop",
  description: "Send an email through the noop transport (test fixture)",
  constraint_schema: z.object({ max_per_day: z.number().int().positive() }),
  rate_limit_default: { count: 50, window: "day" },
  customer_template: "Send up to {max_per_day} test emails per day.",
  available_in_default_standing_grants: false,
  always_requires_budget_attachment: false,
});

describe("action class registry", () => {
  it("registers and looks up an action class", () => {
    registerActionClass(validClass());
    const got = getActionClass("noop.send_email");
    expect(got).toBeDefined();
    expect(got?.source_app).toBe("noop");
  });

  it("assertActionClass throws on unknown", () => {
    expect(() => assertActionClass("noop.does_not_exist")).toThrow(/Unknown action class/);
  });

  it("is idempotent on identical re-registration", () => {
    registerActionClass(validClass());
    registerActionClass(validClass());
    expect(listActionClasses()).toHaveLength(1);
  });

  it("throws on conflicting re-registration", () => {
    registerActionClass(validClass());
    expect(() =>
      registerActionClass({ ...validClass(), description: "different description here for the conflict test" }),
    ).toThrow(/conflicting/);
  });

  it("rejects action_class without app.verb_noun shape", () => {
    expect(() =>
      registerActionClass({ ...validClass(), action_class: "BadShape" }),
    ).toThrow(/<app>\.<verb>_<noun>/);
  });

  it("rejects mismatch between source_app and action_class prefix", () => {
    expect(() =>
      registerActionClass({ ...validClass(), source_app: "other" }),
    ).toThrow(/prefix must equal source_app/);
  });

  it('rejects customer_template containing "Authority Grant"', () => {
    expect(() =>
      registerActionClass({
        ...validClass(),
        customer_template: "Grant an Authority Grant for sending up to {max_per_day}.",
      }),
    ).toThrow(/Authority Grant/);
  });

  it("rejects spend-bearing class being default-grant-eligible", () => {
    expect(() =>
      registerActionClass({
        ...validClass(),
        available_in_default_standing_grants: true,
        always_requires_budget_attachment: true,
      }),
    ).toThrow(/available_in_default_standing_grants must be false/);
  });

  it("rejects bad rate_limit_default values", () => {
    expect(() =>
      registerActionClass({
        ...validClass(),
        rate_limit_default: { count: 0, window: "day" },
      }),
    ).toThrow(/positive integer/);
  });

  it("listActionClassesForApp filters by source_app", () => {
    registerActionClass(validClass());
    registerActionClass({
      ...validClass(),
      action_class: "other.publish_post",
      source_app: "other",
      description: "Publish a post via the other test fixture",
      customer_template: "Publish posts.",
    });
    expect(listActionClassesForApp("noop")).toHaveLength(1);
    expect(listActionClassesForApp("other")).toHaveLength(1);
  });
});
