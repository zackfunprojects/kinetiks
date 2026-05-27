import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { PatternTypeDescriptor } from "@kinetiks/types";
import {
  _resetActionClassRegistryForTests,
  _resetOperatorRegistryForTests,
  _resetPatternTypeRegistryForTests,
  _resetToolRegistryForTests,
  assertRegistriesValid,
  defineTool,
  registerActionClass,
  registerOperators,
  registerPatternType,
  registerTool,
  ToolError,
  validateRegistries,
} from "../index";

afterEach(() => {
  _resetToolRegistryForTests();
  _resetActionClassRegistryForTests();
  _resetOperatorRegistryForTests();
  _resetPatternTypeRegistryForTests();
});

function patternType(over: Partial<PatternTypeDescriptor> = {}): PatternTypeDescriptor {
  return {
    pattern_type: "noop.test_signature.rate",
    source_app: "noop",
    description:
      "A test fixture pattern type used by the cross-registry validator suite.",
    read_apps: ["noop"],
    customer_visible: false,
    dimensions_schema: z.object({ x: z.string() }),
    fingerprint_dimensions: ["x"],
    outcome_metric: "rate",
    outcome_unit: "ratio_0_1",
    outcome_direction: "higher_is_better",
    decay_bounds: {
      initial_decay_days: 30,
      decay_floor_days: 14,
      decay_ceiling_days: 90,
      calibration_sample_threshold: 10,
    },
    confidence_thresholds: { validate_at: 0.7, decline_at: 0.4 },
    expected_max_fingerprints_per_account: 100,
    ...over,
  };
}

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

  it("fails when an operator references an unregistered pattern_type", () => {
    // Cardinality intent warning is expected here; mute console.warn.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerOperators("noop", [
      {
        key: "pattern_aware",
        description: "Operator that reads patterns; references a missing pattern type",
        inputs_schema: z.object({}),
        outputs_schema: z.object({}),
        required_tools: [],
        required_patterns: ["noop.ghost_signature"],
        action_classes: [],
      },
    ]);
    const report = validateRegistries();
    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toMatch(
      /unregistered pattern_type "noop.ghost_signature"/,
    );
    warn.mockRestore();
  });

  it("succeeds when an operator references a registered pattern_type", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerPatternType(patternType());
    registerOperators("noop", [
      {
        key: "pattern_aware",
        description: "Operator that reads a registered pattern type",
        inputs_schema: z.object({}),
        outputs_schema: z.object({}),
        required_tools: [],
        required_patterns: ["noop.test_signature.rate"],
        action_classes: [],
      },
    ]);
    const report = validateRegistries();
    expect(report.ok).toBe(true);
    expect(report.counts.patternTypes).toBe(1);
    warn.mockRestore();
  });

  // Phase 4 — Authority Agent wildcard sentinel.
  it("succeeds when an operator declares required_patterns: ['*']", () => {
    // No patterns registered at all — sentinel passes regardless.
    registerOperators("noop", [
      {
        key: "authority_agent",
        description:
          "Test fixture: the Authority Agent reads every pattern type allowed for its source_app via the * sentinel",
        inputs_schema: z.object({}),
        outputs_schema: z.object({}),
        required_tools: [],
        required_patterns: ["*"],
        action_classes: [],
      },
    ]);
    const report = validateRegistries();
    expect(report.ok).toBe(true);
  });

  it("'*' sentinel does not mask a sibling missing pattern_type", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerOperators("noop", [
      {
        key: "mixed",
        description:
          "Operator with both the wildcard and a specific (but unregistered) pattern type — only the specific entry should fail",
        inputs_schema: z.object({}),
        outputs_schema: z.object({}),
        required_tools: [],
        required_patterns: ["*", "noop.ghost_signature"],
        action_classes: [],
      },
    ]);
    const report = validateRegistries();
    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toMatch(
      /unregistered pattern_type "noop.ghost_signature"/,
    );
    warn.mockRestore();
  });
});
