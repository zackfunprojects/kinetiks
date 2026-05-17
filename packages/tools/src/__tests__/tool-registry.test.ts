import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  _resetToolRegistryForTests,
  defineTool,
  getTool,
  isAvailable,
  listAvailableTools,
  listTools,
  registerTool,
  ToolError,
  type AgentTool,
  type AvailabilityResolvers,
} from "../index";

afterEach(() => {
  _resetToolRegistryForTests();
});

const readOnlyTool = defineTool({
  name: "noop_read",
  description: "A no-op read-only tool used to verify the registry path",
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({ echoed: z.string() }),
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "always" },
  execute: async (input) => ({ echoed: input.id }),
});

const consequentialTool = defineTool({
  name: "noop_send",
  description: "A no-op consequential tool used to exercise idempotency",
  inputSchema: z.object({ to: z.string(), body: z.string() }),
  outputSchema: z.object({ delivered: z.boolean() }),
  isConsequential: true,
  actionClass: "noop.send_email",
  autoApproveThreshold: 0.9,
  availability: { kind: "always" },
  idempotencyKeyFrom: (input) => `${input.to}|${input.body.length}`,
  execute: async () => ({ delivered: true }),
});

describe("tool registry", () => {
  it("registers and looks up a tool", () => {
    registerTool(readOnlyTool);
    const found = getTool("noop_read");
    expect(found).toBeDefined();
    expect(found?.name).toBe("noop_read");
    expect(listTools()).toHaveLength(1);
  });

  it("is idempotent for identical re-registration", () => {
    registerTool(readOnlyTool);
    registerTool(readOnlyTool);
    expect(listTools()).toHaveLength(1);
  });

  it("rejects re-registration with conflicting descriptor", () => {
    registerTool(readOnlyTool);
    const conflicting = { ...readOnlyTool, description: "different description here" } as AgentTool;
    expect(() => registerTool(conflicting)).toThrow(ToolError);
  });

  it("rejects tool names that aren't lowercase snake_case", () => {
    const bad = { ...readOnlyTool, name: "ReadTool" } as AgentTool;
    expect(() => registerTool(bad)).toThrow(/snake_case/);
  });

  it("rejects descriptions shorter than 16 chars", () => {
    const bad = { ...readOnlyTool, name: "short_desc", description: "too short" } as AgentTool;
    expect(() => registerTool(bad)).toThrow(/16 characters/);
  });

  it("rejects consequential tool without actionClass", () => {
    const bad = {
      ...consequentialTool,
      name: "bad_send",
      actionClass: undefined,
    } as AgentTool;
    expect(() => registerTool(bad)).toThrow(/actionClass/);
  });

  it("rejects consequential tool without idempotencyKeyFrom", () => {
    const bad = {
      ...consequentialTool,
      name: "bad_send_2",
      idempotencyKeyFrom: undefined,
    } as AgentTool;
    expect(() => registerTool(bad)).toThrow(/idempotencyKeyFrom/);
  });

  it("rejects non-consequential tool that declares actionClass", () => {
    const bad = { ...readOnlyTool, name: "bad_read", actionClass: "foo.bar" } as AgentTool;
    expect(() => registerTool(bad)).toThrow(/not consequential/);
  });

  it("rejects autoApproveThreshold outside [0, 1]", () => {
    const bad = { ...readOnlyTool, name: "bad_th", autoApproveThreshold: 1.5 } as AgentTool;
    expect(() => registerTool(bad)).toThrow(/\[0, 1\]/);
  });

  it("rejects custom availability without customAvailability fn", () => {
    const bad = {
      ...readOnlyTool,
      name: "bad_avail",
      availability: { kind: "custom", key: "x" } as const,
    } as AgentTool;
    expect(() => registerTool(bad)).toThrow(/custom/i);
  });
});

describe("tool availability resolution", () => {
  const resolvers: AvailabilityResolvers = {
    connection_required: async (_ctx, provider) => provider === "ga4",
    plan_required: async (_ctx, minPlan) => minPlan === "free",
  };

  it("resolves connection_required by provider", async () => {
    const ga4 = defineTool({
      ...readOnlyTool,
      name: "ga4_query",
      description: "Query GA4 via the connection; returns rows",
      availability: { kind: "connection_required", provider: "ga4" },
    });
    const stripe = defineTool({
      ...readOnlyTool,
      name: "stripe_query",
      description: "Query Stripe via the connection; returns rows",
      availability: { kind: "connection_required", provider: "stripe" },
    });
    registerTool(ga4);
    registerTool(stripe);
    const ctx = { accountId: "acc-1" };
    const avail = await listAvailableTools(ctx, resolvers);
    expect(avail.map((t) => t.name)).toEqual(["ga4_query"]);
  });

  it("custom availability defers to customAvailability fn", async () => {
    const onlyAcc2 = defineTool({
      ...readOnlyTool,
      name: "only_acc_2",
      description: "Available only to one specific account",
      availability: { kind: "custom", key: "is_acc_2" },
      customAvailability: async (c) => c.accountId === "acc-2",
    });
    registerTool(onlyAcc2);
    expect(await isAvailable(onlyAcc2, { accountId: "acc-1" }, resolvers)).toBe(false);
    expect(await isAvailable(onlyAcc2, { accountId: "acc-2" }, resolvers)).toBe(true);
  });
});
