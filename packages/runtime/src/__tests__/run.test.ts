import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  _resetActionClassRegistryForTests,
  _resetToolRegistryForTests,
  configureToolCallLogger,
  defineTool,
  registerActionClass,
  registerTool,
  ToolError,
  type ToolCallLogPayload,
} from "@kinetiks/tools";
import {
  configureAuthorityResolver,
  configureDailySpendCounter,
  configurePerActionApprovalHandler,
  startAgentRun,
} from "../index";

let captured: ToolCallLogPayload[] = [];

beforeEach(() => {
  captured = [];
  configureToolCallLogger(async (p) => {
    captured.push(p);
  });
  configureAuthorityResolver(null); // F2 stub: auto_threshold for everything
  configurePerActionApprovalHandler(null);
});

afterEach(() => {
  _resetToolRegistryForTests();
  _resetActionClassRegistryForTests();
  configureToolCallLogger(null);
  configureAuthorityResolver(null);
  configurePerActionApprovalHandler(null);
  configureDailySpendCounter(null);
});

function registerSendEmailClass(): void {
  registerActionClass({
    action_class: "noop.send_email",
    source_app: "noop",
    description: "Send a noop test email; used as a runtime fixture",
    constraint_schema: z.object({}),
    rate_limit_default: null,
    customer_template: "Send a noop test email.",
    available_in_default_standing_grants: false,
    always_requires_budget_attachment: false,
  });
}

const readOnly = defineTool({
  name: "noop_read",
  description: "Read-only test fixture: echoes the id back",
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({ echoed: z.string() }),
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "always" },
  execute: async (input) => ({ echoed: input.id }),
});

const flakyTool = (() => {
  let attempts = 0;
  return defineTool({
    name: "flaky_read",
    description: "Test fixture that fails transiently on the first attempt",
    inputSchema: z.object({}),
    outputSchema: z.object({ ok: z.boolean() }),
    isConsequential: false,
    autoApproveThreshold: null,
    availability: { kind: "always" },
    execute: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new ToolError("transient", "simulated transient failure");
      }
      return { ok: true };
    },
  });
})();

const consequential = defineTool({
  name: "noop_send",
  description: "Consequential test fixture: pretends to send an email",
  inputSchema: z.object({ to: z.string().email(), body: z.string().min(1) }),
  outputSchema: z.object({ delivered: z.literal(true) }),
  isConsequential: true,
  actionClass: "noop.send_email",
  autoApproveThreshold: 0.9,
  availability: { kind: "always" },
  idempotencyKeyFrom: (input) => `${input.to}|${input.body.length}`,
  execute: async () => ({ delivered: true as const }),
});

describe("AgentRun.invokeTool", () => {
  it("runs a read-only tool and records the trace", async () => {
    registerTool(readOnly);
    const run = startAgentRun({ accountId: "acc_1", invokedByAgent: "marcus" });
    const out = await run.invokeTool(readOnly, { id: "abc" });
    expect(out).toEqual({ echoed: "abc" });
    const summary = run.summary();
    expect(summary.toolCalls).toBe(1);
    expect(summary.toolFailures).toBe(0);
    expect(summary.trace[0].toolName).toBe("noop_read");
    expect(summary.trace[0].status).toBe("success");
    expect(summary.trace[0].authorityOutcome).toBe("auto_threshold");
    // tool_calls log carries the run id in metadata
    expect(captured[0].metadata.agent_run_id).toBe(summary.runId);
    expect(captured[0].authorityOutcome).toBe("auto_threshold");
  });

  it("retries on transient errors per the default policy", async () => {
    registerTool(flakyTool);
    const run = startAgentRun({ accountId: "acc_1", invokedByAgent: "marcus" });
    const out = await run.invokeTool(flakyTool, {});
    expect(out).toEqual({ ok: true });
    const summary = run.summary();
    expect(summary.toolCalls).toBe(2);
    expect(summary.trace[0].status).toBe("error");
    expect(summary.trace[0].errorClass).toBe("transient");
    expect(summary.trace[1].status).toBe("success");
    // Two log rows: one for the failed attempt, one for the retry success
    const tries = captured.filter((p) => p.toolName === "flaky_read");
    expect(tries).toHaveLength(2);
  });

  it("does not retry non-retryable errors", async () => {
    const denied = defineTool({
      ...readOnly,
      name: "denied_read",
      description: "Always denied availability — caller cannot use this tool",
      availability: { kind: "connection_required", provider: "missing_provider" },
    });
    registerTool(denied);
    const run = startAgentRun({
      accountId: "acc_1",
      invokedByAgent: "marcus",
      availability: {
        connection_required: async () => false,
        plan_required: async () => true,
      },
    });
    await expect(run.invokeTool(denied, { id: "x" })).rejects.toThrow(ToolError);
    const summary = run.summary();
    expect(summary.toolCalls).toBe(1);
    expect(summary.toolFailures).toBe(1);
    expect(summary.trace[0].status).toBe("denied");
  });

  it("threads runId/correlationIds into the tool_calls log", async () => {
    registerTool(readOnly);
    const run = startAgentRun({
      accountId: "acc_42",
      invokedByAgent: "marcus",
      threadId: "11111111-1111-1111-1111-111111111111",
      correlationId: "corr-xyz",
    });
    await run.invokeTool(readOnly, { id: "abc" });
    expect(captured[0].accountId).toBe("acc_42");
    expect(captured[0].invokedByAgent).toBe("marcus");
    expect(captured[0].threadId).toBe("11111111-1111-1111-1111-111111111111");
    expect(captured[0].correlationId).toBe("corr-xyz");
    expect(captured[0].agentRunId).toBe(run.runId);
  });

  it("fails CLOSED for a consequential tool with no covering grant and no approval handler", async () => {
    // Remediation (Finding 1.2): the F2 stub resolves to auto_threshold
    // (no grant). A consequential action must NOT execute without an
    // approval; with no per-action handler configured the runtime refuses
    // rather than executing — the opposite of the pre-fix behavior.
    registerSendEmailClass();
    registerTool(consequential);
    const run = startAgentRun({ accountId: "acc_1", invokedByAgent: "marcus" });
    await expect(
      run.invokeTool(consequential, { to: "x@example.com", body: "hi" }),
    ).rejects.toMatchObject({ errorClass: "configuration_error" });
    // The tool never executed: no tool_calls row was emitted.
    expect(captured).toHaveLength(0);
  });

  it("queues a consequential tool with no covering grant (per-action approval, decision=queued)", async () => {
    configurePerActionApprovalHandler({
      request: async () => ({ decision: "queued", approval_id: "appr_1" }),
    });
    registerSendEmailClass();
    registerTool(consequential);
    const run = startAgentRun({ accountId: "acc_1", invokedByAgent: "marcus" });
    await expect(
      run.invokeTool(consequential, { to: "x@example.com", body: "hi" }),
    ).rejects.toMatchObject({ errorClass: "queued_for_approval" });
    // Queued, never executed.
    expect(captured).toHaveLength(0);
    expect(run.summary().authorityOutcomes.queued).toBe(1);
    expect(run.summary().trace[0].status).toBe("queued_for_approval");
  });

  it("executes a consequential tool when the per-action flow auto-approves, pinning the approval id", async () => {
    let seenThreshold: number | null | undefined;
    configurePerActionApprovalHandler({
      request: async (req) => {
        seenThreshold = req.auto_approve_threshold;
        return { decision: "auto_approved", approval_id: "appr_2" };
      },
    });
    registerSendEmailClass();
    registerTool(consequential);
    const run = startAgentRun({ accountId: "acc_1", invokedByAgent: "marcus" });
    const out = await run.invokeTool(consequential, {
      to: "x@example.com",
      body: "hi",
    });
    expect(out).toEqual({ delivered: true });
    // The approval id is pinned onto the tool_calls row.
    expect(captured[0].approvalId).toBe("appr_2");
    // The tool's descriptor threshold reached the handler.
    expect(seenThreshold).toBe(0.9);
  });

  it("skips authority resolution AND the gate for a pre-approved execution", async () => {
    // No handler configured: if the gate ran it would throw. preApproved
    // must bypass resolution + the gate so an approved action can execute.
    registerSendEmailClass();
    registerTool(consequential);
    const run = startAgentRun({ accountId: "acc_1", invokedByAgent: "marcus" });
    const out = await run.invokeTool(
      consequential,
      { to: "x@example.com", body: "hi" },
      { preApproved: true, approvalId: "appr_3" },
    );
    expect(out).toEqual({ delivered: true });
    expect(captured[0].approvalId).toBe("appr_3");
  });

  it("overrides authority resolution via configureAuthorityResolver (L2a hook)", async () => {
    configureAuthorityResolver(async () => ({
      outcome: "grant_covers",
      grantId: "grant_abc",
    }));
    registerActionClass({
      action_class: "noop.send_email",
      source_app: "noop",
      description: "Send a noop test email; used as a runtime fixture",
      constraint_schema: z.object({}),
      rate_limit_default: null,
      customer_template: "Send a noop test email.",
      available_in_default_standing_grants: false,
      always_requires_budget_attachment: false,
    });
    registerTool(consequential);
    const run = startAgentRun({ accountId: "acc_1", invokedByAgent: "marcus" });
    await run.invokeTool(consequential, { to: "x@example.com", body: "hi" });
    expect(captured[0].authorityOutcome).toBe("grant_covers");
    expect(captured[0].grantId).toBe("grant_abc");
    expect(run.summary().authorityOutcomes.grant_covers).toBe(1);
  });

  it("aborts the run when the run-level AbortSignal fires before invocation", async () => {
    registerTool(readOnly);
    const ctrl = new AbortController();
    ctrl.abort();
    const run = startAgentRun({
      accountId: "acc_1",
      invokedByAgent: "marcus",
      signal: ctrl.signal,
      retry: { maxAttempts: 3 },
    });
    // The first call still runs — the executor doesn't check the signal
    // before execute(); but if the tool checks it, it aborts. For F2 the
    // signal is propagated into ctx so tools that honor it abort.
    const sawSignal = vi.fn();
    const observerTool = defineTool({
      ...readOnly,
      name: "observer",
      description: "Observes the AbortSignal forwarded via ctx",
      execute: async (input, ctx) => {
        sawSignal(Boolean(ctx.signal?.aborted));
        return { echoed: input.id };
      },
    });
    registerTool(observerTool);
    await run.invokeTool(observerTool, { id: "x" });
    expect(sawSignal).toHaveBeenCalledWith(true);
  });
});

describe("startAgentRun validation", () => {
  it("throws when accountId is missing", () => {
    expect(() =>
      // @ts-expect-error testing runtime validation
      startAgentRun({ invokedByAgent: "marcus" }),
    ).toThrow(/accountId/);
  });
  it("throws when invokedByAgent is missing", () => {
    expect(() =>
      // @ts-expect-error testing runtime validation
      startAgentRun({ accountId: "acc_1" }),
    ).toThrow(/invokedByAgent/);
  });
});


// ─────────────────────────────────────────────
// E2 — spend reservation release on terminal failure
// ─────────────────────────────────────────────

describe("AgentRun spend reservation release", () => {
  const RESERVATION = {
    counter_key: "authority_spend:g_1",
    day_utc: "2026-06-12",
    amount: 25,
    currency: "USD",
  };

  function spendCoveredResolver() {
    configureAuthorityResolver(async () => ({
      outcome: "grant_covers" as const,
      grantId: "g_1",
      spendReservation: { ...RESERVATION },
    }));
  }

  it("releases the reservation when execution fails terminally", async () => {
    registerSendEmailClass();
    const failing = defineTool({
      name: "noop_fail_spend",
      description: "Always fails permanently",
      inputSchema: z.object({ spend_amount: z.number() }),
      outputSchema: z.object({}),
      isConsequential: true,
      actionClass: "noop.send_email",
      autoApproveThreshold: null,
      availability: { kind: "always" },
      idempotencyKeyFrom: (input: { spend_amount: number }) => String(input.spend_amount),
      execute: async () => {
        throw new ToolError("invalid_input", "permanent failure");
      },
    });
    registerTool(failing);
    spendCoveredResolver();

    const releases: Array<Record<string, unknown>> = [];
    configureDailySpendCounter({
      async reserve() {
        throw new Error("resolver is mocked; reserve must not be called");
      },
      async release(args) {
        releases.push({ ...args });
      },
    });

    const run = startAgentRun({ accountId: "acc_1", invokedByAgent: "test" });
    await expect(
      run.invokeTool(failing, { spend_amount: 25 }),
    ).rejects.toMatchObject({ errorClass: "invalid_input" });

    expect(releases).toHaveLength(1);
    expect(releases[0]).toEqual({
      account_id: "acc_1",
      counter_key: RESERVATION.counter_key,
      day_utc: RESERVATION.day_utc,
      amount: RESERVATION.amount,
    });
  });

  it("keeps the reservation when execution succeeds", async () => {
    registerSendEmailClass();
    const succeeding = defineTool({
      name: "noop_ok_spend",
      description: "Succeeds for the spend reservation test",
      inputSchema: z.object({ spend_amount: z.number() }),
      outputSchema: z.object({ ok: z.boolean() }),
      isConsequential: true,
      actionClass: "noop.send_email",
      autoApproveThreshold: null,
      availability: { kind: "always" },
      idempotencyKeyFrom: (input: { spend_amount: number }) => String(input.spend_amount),
      execute: async () => ({ ok: true }),
    });
    registerTool(succeeding);
    spendCoveredResolver();

    const releases: unknown[] = [];
    configureDailySpendCounter({
      async reserve() {
        throw new Error("resolver is mocked; reserve must not be called");
      },
      async release(args) {
        releases.push(args);
      },
    });

    const run = startAgentRun({ accountId: "acc_1", invokedByAgent: "test" });
    await expect(
      run.invokeTool(succeeding, { spend_amount: 25 }),
    ).resolves.toEqual({ ok: true });
    expect(releases).toHaveLength(0);
  });

  it("a failed release never masks the original tool error", async () => {
    registerSendEmailClass();
    const failing = defineTool({
      name: "noop_fail_spend_2",
      description: "Always fails permanently",
      inputSchema: z.object({ spend_amount: z.number() }),
      outputSchema: z.object({}),
      isConsequential: true,
      actionClass: "noop.send_email",
      autoApproveThreshold: null,
      availability: { kind: "always" },
      idempotencyKeyFrom: (input: { spend_amount: number }) => String(input.spend_amount),
      execute: async () => {
        throw new ToolError("invalid_input", "the real failure");
      },
    });
    registerTool(failing);
    spendCoveredResolver();
    configureDailySpendCounter({
      async reserve() {
        return { reserved: true, total_after: 25 };
      },
      async release() {
        throw new Error("release outage");
      },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = startAgentRun({ accountId: "acc_1", invokedByAgent: "test" });
    await expect(
      run.invokeTool(failing, { spend_amount: 25 }),
    ).rejects.toMatchObject({ message: "the real failure" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
