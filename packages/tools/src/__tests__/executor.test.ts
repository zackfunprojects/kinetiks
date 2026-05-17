import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  _resetActionClassRegistryForTests,
  _resetToolRegistryForTests,
  configureToolCallLogger,
  defineTool,
  executeTool,
  registerActionClass,
  registerTool,
  ToolError,
  type ToolCallLogPayload,
} from "../index";

let captured: ToolCallLogPayload[] = [];

beforeEach(() => {
  captured = [];
  configureToolCallLogger(async (p) => {
    captured.push(p);
  });
});

afterEach(() => {
  _resetToolRegistryForTests();
  _resetActionClassRegistryForTests();
  configureToolCallLogger(null);
});

const readOnly = defineTool({
  name: "echo_read",
  description: "Echoes the provided id; deterministic and side-effect-free",
  inputSchema: z.object({ id: z.string().min(1) }),
  outputSchema: z.object({ echoed: z.string() }),
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "always" },
  execute: async (input) => ({ echoed: input.id }),
});

const consequential = defineTool({
  name: "echo_send",
  description: "Pretends to send a message; deterministic and observable",
  inputSchema: z.object({ to: z.string().email(), body: z.string().min(1) }),
  outputSchema: z.object({ delivered: z.literal(true) }),
  isConsequential: true,
  actionClass: "noop.send_email",
  autoApproveThreshold: 0.95,
  availability: { kind: "always" },
  idempotencyKeyFrom: (input) => `${input.to}|${input.body.length}`,
  execute: async () => ({ delivered: true as const }),
});

const ctx = {
  accountId: "acc_1",
  invokedByAgent: "marcus",
};

describe("executeTool", () => {
  it("validates input and emits a success log", async () => {
    registerTool(readOnly);
    const out = await executeTool(readOnly, { id: "abc" }, ctx);
    expect(out).toEqual({ echoed: "abc" });
    expect(captured).toHaveLength(1);
    expect(captured[0].status).toBe("success");
    expect(captured[0].errorClass).toBeNull();
    expect(captured[0].authorityOutcome).toBe("auto_threshold");
  });

  it("rejects invalid input with invalid_input + logs failure", async () => {
    registerTool(readOnly);
    await expect(executeTool(readOnly, { id: 123 }, ctx)).rejects.toThrow(ToolError);
    expect(captured).toHaveLength(1);
    expect(captured[0].status).toBe("error");
    expect(captured[0].errorClass).toBe("invalid_input");
  });

  it("rejects invalid output", async () => {
    const badOutput = defineTool({
      ...readOnly,
      name: "echo_bad_output",
      execute: async () => ({ echoed: 42 } as unknown as { echoed: string }),
    });
    registerTool(badOutput);
    await expect(executeTool(badOutput, { id: "abc" }, ctx)).rejects.toThrow(/outputSchema/);
    expect(captured[0].errorClass).toBe("invalid_output");
  });

  it("blocks tools whose availability resolves false", async () => {
    const ga4 = defineTool({
      ...readOnly,
      name: "ga4_query",
      description: "Query GA4 via the connection; returns rows",
      availability: { kind: "connection_required", provider: "ga4" },
    });
    registerTool(ga4);
    await expect(
      executeTool(ga4, { id: "x" }, ctx, {
        availability: {
          connection_required: async () => false,
          plan_required: async () => true,
        },
      }),
    ).rejects.toThrow(/not available/);
    expect(captured[0].status).toBe("denied");
    expect(captured[0].errorClass).toBe("unavailable");
  });

  it("consequential tool records actionClass and idempotencyKey", async () => {
    registerActionClass({
      action_class: "noop.send_email",
      source_app: "noop",
      description: "Send a test email via the noop transport (fixture)",
      constraint_schema: z.object({}),
      rate_limit_default: null,
      customer_template: "Send a test email.",
      available_in_default_standing_grants: false,
      always_requires_budget_attachment: false,
    });
    registerTool(consequential);
    const out = await executeTool(
      consequential,
      { to: "x@example.com", body: "hi" },
      ctx,
    );
    expect(out).toEqual({ delivered: true });
    expect(captured[0].actionClass).toBe("noop.send_email");
    expect(captured[0].idempotencyKey).toBe("x@example.com|2");
    expect(captured[0].authorityOutcome).toBeNull(); // F2 fills this
  });

  it("idempotency dedup short-circuits with the cached output", async () => {
    registerActionClass({
      action_class: "noop.send_email",
      source_app: "noop",
      description: "Send a test email via the noop transport (fixture)",
      constraint_schema: z.object({}),
      rate_limit_default: null,
      customer_template: "Send a test email.",
      available_in_default_standing_grants: false,
      always_requires_budget_attachment: false,
    });
    registerTool(consequential);
    const executeSpy = vi.spyOn(consequential, "execute");
    const out = await executeTool(
      consequential,
      { to: "x@example.com", body: "hi" },
      ctx,
      {
        idempotency: {
          findSuccessful: async () => ({ output: { delivered: true } }),
        },
      },
    );
    expect(out).toEqual({ delivered: true });
    expect(executeSpy).not.toHaveBeenCalled();
    expect(captured[0].metadata.idempotent_dedup).toBe(true);
    executeSpy.mockRestore();
  });

  it("falls through to a fresh execute when cached output fails outputSchema", async () => {
    registerActionClass({
      action_class: "noop.send_email",
      source_app: "noop",
      description: "Send a test email via the noop transport (fixture)",
      constraint_schema: z.object({}),
      rate_limit_default: null,
      customer_template: "Send a test email.",
      available_in_default_standing_grants: false,
      always_requires_budget_attachment: false,
    });
    registerTool(consequential);
    const out = await executeTool(
      consequential,
      { to: "x@example.com", body: "hi" },
      ctx,
      {
        idempotency: {
          findSuccessful: async () => ({ output: { wrong_shape: true } }),
        },
      },
    );
    expect(out).toEqual({ delivered: true });
  });
});
