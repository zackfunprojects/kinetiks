import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  _resetActionClassRegistryForTests,
  _resetOperatorRegistryForTests,
  _resetToolRegistryForTests,
  assertRegistriesValid,
  defineTool,
  registerActionClass,
  registerOperators,
  registerTool,
  ToolError,
  validateRegistries,
} from "../index";

afterEach(() => {
  _resetToolRegistryForTests();
  _resetActionClassRegistryForTests();
  _resetOperatorRegistryForTests();
});

describe("cross-registry validation", () => {
  it("succeeds when all references are satisfied", () => {
    registerActionClass({
      action_class: "noop.send_email",
      source_app: "noop",
      description: "Send a test email through the noop transport",
      constraint_schema: z.object({}),
      rate_limit_default: null,
      customer_template: "Send a test email.",
      available_in_default_standing_grants: false,
      always_requires_budget_attachment: false,
    });
    const sendTool = defineTool({
      name: "noop_send",
      description: "Sends an email via the noop transport (test fixture)",
      inputSchema: z.object({ to: z.string() }),
      outputSchema: z.object({ delivered: z.boolean() }),
      isConsequential: true,
      actionClass: "noop.send_email",
      autoApproveThreshold: 0.9,
      availability: { kind: "always" },
      idempotencyKeyFrom: (i: { to: string }) => i.to,
      execute: async () => ({ delivered: true }),
    });
    registerTool(sendTool);
    registerOperators("noop", [
      {
        key: "scout",
        description: "Finds prospects to send to; the canonical test fixture",
        inputs_schema: z.object({}),
        outputs_schema: z.object({}),
        required_tools: ["noop_send"],
        required_patterns: [],
        action_classes: ["noop.send_email"],
      },
    ]);
    const report = assertRegistriesValid();
    expect(report.ok).toBe(true);
    expect(report.counts.tools).toBe(1);
    expect(report.counts.actionClasses).toBe(1);
    expect(report.counts.operators).toBe(1);
  });

  it("fails when a consequential tool references an unregistered action class", () => {
    const sendTool = defineTool({
      name: "noop_send",
      description: "Sends an email via the noop transport (test fixture)",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      isConsequential: true,
      actionClass: "noop.does_not_exist",
      autoApproveThreshold: 0.9,
      availability: { kind: "always" },
      idempotencyKeyFrom: () => "k",
      execute: async () => ({}),
    });
    registerTool(sendTool);
    const report = validateRegistries();
    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toMatch(/unregistered action_class "noop.does_not_exist"/);
    expect(() => assertRegistriesValid()).toThrow(ToolError);
  });

  it("fails when an operator references an unregistered tool", () => {
    registerOperators("noop", [
      {
        key: "scout",
        description: "References a tool that does not exist for the assertion",
        inputs_schema: z.object({}),
        outputs_schema: z.object({}),
        required_tools: ["ghost_tool"],
        required_patterns: [],
        action_classes: [],
      },
    ]);
    const report = validateRegistries();
    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toMatch(/unregistered tool "ghost_tool"/);
  });

  it("warns when an action class has no tool referencing it", () => {
    registerActionClass({
      action_class: "noop.orphan",
      source_app: "noop",
      description: "An orphan action class with no tool reference",
      constraint_schema: z.object({}),
      rate_limit_default: null,
      customer_template: "Orphan action.",
      available_in_default_standing_grants: false,
      always_requires_budget_attachment: false,
    });
    const report = validateRegistries();
    expect(report.ok).toBe(true);
    expect(report.warnings.join("\n")).toMatch(/not referenced by any tool/);
  });

  it("warns when an operator declares required_patterns before L1a lands", () => {
    registerOperators("noop", [
      {
        key: "pattern_aware",
        description: "Operator that reads patterns; warns until L1a ships",
        inputs_schema: z.object({}),
        outputs_schema: z.object({}),
        required_tools: [],
        required_patterns: ["pattern.creative_signature"],
        action_classes: [],
      },
    ]);
    const report = validateRegistries();
    expect(report.ok).toBe(true);
    expect(report.warnings.join("\n")).toMatch(/Pattern Type Registry is not active/);
  });
});
