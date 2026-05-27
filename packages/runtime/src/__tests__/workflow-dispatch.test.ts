/**
 * Unit tests for the Workflow dispatcher.
 *
 * Covered:
 *  - internal_operator: happy path with input/output validation + Ledger writes
 *  - internal_operator: upstream output propagation between two tasks
 *  - internal_operator: unregistered operator descriptor (assertOperator throws)
 *  - internal_operator: descriptor registered but no executor wired
 *  - internal_operator: input fails inputs_schema → invalid_input, executor not invoked
 *  - internal_operator: output fails outputs_schema → invalid_output, failed Ledger fires
 *  - cross_app: happy path inserts a routing event with the expected payload shape
 *  - runWorkflow: first failure stops subsequent tasks (not dispatched at all)
 *  - runWorkflow: ok:false reflected in summary
 *  - Ledger write failures do NOT halt the workflow (best-effort observability)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  _resetOperatorRegistryForTests,
  registerOperators,
  ToolError,
} from "@kinetiks/tools";
import type {
  WorkflowDefinition,
  WorkflowDispatchContext,
  WorkflowTask,
} from "@kinetiks/types";
import {
  dispatchWorkflowTask,
  runWorkflow,
  type DispatchDeps,
  type LedgerWrite,
  type OperatorExecutor,
  type RoutingEventInsert,
} from "../workflow-dispatch";

// ============================================================
// Fixtures + harness
// ============================================================

function makeCtx(overrides: Partial<WorkflowDispatchContext> = {}): WorkflowDispatchContext {
  return {
    account_id: "acc_test_1",
    correlation_id: "corr_test_xyz",
    invoked_by: "cron:test",
    team_scope_id: null,
    ...overrides,
  };
}

interface Harness {
  deps: DispatchDeps;
  ledger: LedgerWrite[];
  routing: RoutingEventInsert[];
  executors: Map<string, OperatorExecutor>;
  installExecutor: (app: string, key: string, fn: OperatorExecutor) => void;
  failNextLedger: () => void;
}

function makeHarness(): Harness {
  const ledger: LedgerWrite[] = [];
  const routing: RoutingEventInsert[] = [];
  const executors = new Map<string, OperatorExecutor>();
  let failNextWrite = false;

  const deps: DispatchDeps = {
    resolveOperator: (app, key) => executors.get(`${app}.${key}`),
    insertRoutingEvent: async (row) => {
      routing.push(row);
    },
    writeLedger: async (entry) => {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error("simulated ledger failure");
      }
      ledger.push(entry);
    },
  };

  return {
    deps,
    ledger,
    routing,
    executors,
    installExecutor: (app, key, fn) => executors.set(`${app}.${key}`, fn),
    failNextLedger: () => {
      failNextWrite = true;
    },
  };
}

beforeEach(() => {
  // Suppress the expected error logs from safeLedger in the failing-ledger test.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  _resetOperatorRegistryForTests();
  vi.restoreAllMocks();
});

// ============================================================
// internal_operator
// ============================================================

describe("dispatchWorkflowTask: internal_operator", () => {
  it("validates input/output, invokes executor, writes dispatched + completed Ledger entries", async () => {
    registerOperators("test_app", [
      {
        key: "echo",
        description: "Echo back the input number doubled (test-only)",
        inputs_schema: z.object({ n: z.number() }),
        outputs_schema: z.object({ doubled: z.number() }),
        required_tools: [],
        required_patterns: [],
        action_classes: [],
      },
    ]);

    const harness = makeHarness();
    harness.installExecutor("test_app", "echo", async (input) => {
      const { n } = input as { n: number };
      return { doubled: n * 2 };
    });

    const task: WorkflowTask = {
      key: "t1",
      label: "Echo",
      target_type: "internal_operator",
      target_app: "test_app",
      target_capability: "echo",
      input: { n: 21 },
    };

    const result = await dispatchWorkflowTask(task, {}, makeCtx(), harness.deps);

    expect(result.status).toBe("completed");
    expect(result.output).toEqual({ doubled: 42 });

    expect(harness.ledger.map((e) => e.event_type)).toEqual([
      "workflow_task_dispatched",
      "workflow_task_completed",
    ]);
    expect(harness.ledger[0].detail).toMatchObject({
      task_key: "t1",
      target_type: "internal_operator",
      target_app: "test_app",
      target_capability: "echo",
      correlation_id: "corr_test_xyz",
    });
    expect(harness.ledger[1].detail).toMatchObject({
      task_key: "t1",
      latency_ms: expect.any(Number),
      output_summary: { doubled: 42 },
    });
    expect(harness.routing).toHaveLength(0);
  });

  it("throws + writes failed Ledger when the operator descriptor is not registered", async () => {
    const harness = makeHarness();

    const task: WorkflowTask = {
      key: "t1",
      label: "Missing op",
      target_type: "internal_operator",
      target_app: "test_app",
      target_capability: "nonexistent_op",
      input: {},
    };

    await expect(
      dispatchWorkflowTask(task, {}, makeCtx(), harness.deps),
    ).rejects.toBeInstanceOf(ToolError);

    expect(harness.ledger.map((e) => e.event_type)).toEqual([
      "workflow_task_dispatched",
      "workflow_task_failed",
    ]);
    expect(harness.ledger[1].detail).toMatchObject({
      error_class: "configuration_error",
    });
  });

  it("throws when descriptor is registered but no executor is wired", async () => {
    registerOperators("test_app", [
      {
        key: "no_executor",
        description: "Descriptor exists but resolver returns undefined",
        inputs_schema: z.object({}),
        outputs_schema: z.object({}),
        required_tools: [],
        required_patterns: [],
        action_classes: [],
      },
    ]);

    const harness = makeHarness();
    // Intentionally NOT installing an executor.

    const task: WorkflowTask = {
      key: "t1",
      label: "No exec",
      target_type: "internal_operator",
      target_app: "test_app",
      target_capability: "no_executor",
      input: {},
    };

    await expect(
      dispatchWorkflowTask(task, {}, makeCtx(), harness.deps),
    ).rejects.toThrow(/No executor wired/);

    const failed = harness.ledger.find((e) => e.event_type === "workflow_task_failed");
    expect(failed?.detail.error_class).toBe("configuration_error");
  });

  it("throws invalid_input when input fails the inputs_schema and does NOT invoke the executor", async () => {
    registerOperators("test_app", [
      {
        key: "strict_input",
        description: "Rejects any input that isn't { n: number }",
        inputs_schema: z.object({ n: z.number() }),
        outputs_schema: z.object({ ok: z.boolean() }),
        required_tools: [],
        required_patterns: [],
        action_classes: [],
      },
    ]);

    const harness = makeHarness();
    const executor = vi.fn(async () => ({ ok: true }));
    harness.installExecutor("test_app", "strict_input", executor);

    const task: WorkflowTask = {
      key: "t1",
      label: "Bad input",
      target_type: "internal_operator",
      target_app: "test_app",
      target_capability: "strict_input",
      input: { n: "not-a-number" } as unknown,
    };

    await expect(
      dispatchWorkflowTask(task, {}, makeCtx(), harness.deps),
    ).rejects.toMatchObject({ errorClass: "invalid_input" });

    expect(executor).not.toHaveBeenCalled();
    const failed = harness.ledger.find((e) => e.event_type === "workflow_task_failed");
    expect(failed?.detail.error_class).toBe("invalid_input");
  });

  it("throws invalid_output when the executor's return value fails outputs_schema", async () => {
    registerOperators("test_app", [
      {
        key: "bad_output",
        description: "Returns a shape that doesn't match outputs_schema",
        inputs_schema: z.object({}),
        outputs_schema: z.object({ ok: z.boolean() }),
        required_tools: [],
        required_patterns: [],
        action_classes: [],
      },
    ]);

    const harness = makeHarness();
    harness.installExecutor("test_app", "bad_output", async () => ({ wrong: "shape" }));

    const task: WorkflowTask = {
      key: "t1",
      label: "Bad output",
      target_type: "internal_operator",
      target_app: "test_app",
      target_capability: "bad_output",
      input: {},
    };

    await expect(
      dispatchWorkflowTask(task, {}, makeCtx(), harness.deps),
    ).rejects.toMatchObject({ errorClass: "invalid_output" });

    const failed = harness.ledger.find((e) => e.event_type === "workflow_task_failed");
    expect(failed?.detail.error_class).toBe("invalid_output");
  });
});

// ============================================================
// cross_app
// ============================================================

describe("dispatchWorkflowTask: cross_app", () => {
  it("inserts a routing event with the expected payload shape and does NOT look up an operator", async () => {
    const harness = makeHarness();
    // Spy: resolveOperator must NOT be called for cross_app.
    const resolverSpy = vi.fn();
    harness.deps = {
      ...harness.deps,
      resolveOperator: resolverSpy,
    };

    const task: WorkflowTask = {
      key: "t_cross",
      label: "Cross-app routing",
      target_type: "cross_app",
      target_app: "harvest",
      target_capability: "create_sequence",
      input: { name: "Q2 fintech" },
      relevance_note: "Spawned by Phase 3 test",
    };

    const result = await dispatchWorkflowTask(task, {}, makeCtx(), harness.deps);

    expect(resolverSpy).not.toHaveBeenCalled();
    expect(result.output).toEqual({ routed: true, target_app: "harvest" });
    expect(harness.routing).toHaveLength(1);
    expect(harness.routing[0]).toEqual({
      account_id: "acc_test_1",
      target_app: "harvest",
      payload: {
        workflow_key: "ad_hoc",
        task_key: "t_cross",
        capability: "create_sequence",
        input: { name: "Q2 fintech" },
      },
      relevance_note: "Spawned by Phase 3 test",
    });
  });
});

// ============================================================
// runWorkflow
// ============================================================

describe("runWorkflow", () => {
  it("propagates upstream outputs between tasks and stamps workflow_key into Ledger entries", async () => {
    registerOperators("test_app", [
      {
        key: "first",
        description: "Returns a seed number",
        inputs_schema: z.object({}),
        outputs_schema: z.object({ seed: z.number() }),
        required_tools: [],
        required_patterns: [],
        action_classes: [],
      },
      {
        key: "second",
        description: "Doubles the seed produced by the first task",
        inputs_schema: z.object({ n: z.number() }),
        outputs_schema: z.object({ doubled: z.number() }),
        required_tools: [],
        required_patterns: [],
        action_classes: [],
      },
    ]);

    const harness = makeHarness();
    harness.installExecutor("test_app", "first", async () => ({ seed: 5 }));
    harness.installExecutor("test_app", "second", async (input) => {
      const { n } = input as { n: number };
      return { doubled: n * 2 };
    });

    const workflow: WorkflowDefinition = {
      key: "test_app.chain",
      description: "Two-step chain test",
      tasks: [
        {
          key: "a",
          label: "first",
          target_type: "internal_operator",
          target_app: "test_app",
          target_capability: "first",
          input: {},
        },
        {
          key: "b",
          label: "second",
          target_type: "internal_operator",
          target_app: "test_app",
          target_capability: "second",
          input: (upstream: Record<string, unknown>) => ({
            n: (upstream["a"] as { seed: number }).seed,
          }),
        },
      ],
    };

    const summary = await runWorkflow(workflow, makeCtx(), harness.deps);

    expect(summary.ok).toBe(true);
    expect(summary.tasks.map((t) => t.status)).toEqual(["completed", "completed"]);
    expect(summary.tasks[1].output).toEqual({ doubled: 10 });

    // Every Ledger entry written carries the workflow_key.
    for (const entry of harness.ledger) {
      expect(entry.detail.workflow_key).toBe("test_app.chain");
    }
  });

  it("stops on first failure: third task is never dispatched, summary.ok === false", async () => {
    registerOperators("test_app", [
      {
        key: "ok_op",
        description: "Always succeeds; used in halt-on-failure test",
        inputs_schema: z.object({}),
        outputs_schema: z.object({ ok: z.boolean() }),
        required_tools: [],
        required_patterns: [],
        action_classes: [],
      },
      {
        key: "fail_op",
        description: "Always throws; used in halt-on-failure test",
        inputs_schema: z.object({}),
        outputs_schema: z.object({ ok: z.boolean() }),
        required_tools: [],
        required_patterns: [],
        action_classes: [],
      },
      {
        key: "never_dispatched",
        description: "Should never run when a prior task fails",
        inputs_schema: z.object({}),
        outputs_schema: z.object({ ok: z.boolean() }),
        required_tools: [],
        required_patterns: [],
        action_classes: [],
      },
    ]);

    const harness = makeHarness();
    harness.installExecutor("test_app", "ok_op", async () => ({ ok: true }));
    const failExecutor = vi.fn(async () => {
      throw new Error("boom");
    });
    harness.installExecutor("test_app", "fail_op", failExecutor);
    const neverCalled = vi.fn(async () => ({ ok: true }));
    harness.installExecutor("test_app", "never_dispatched", neverCalled);

    const workflow: WorkflowDefinition = {
      key: "test_app.halt",
      description: "Stops on first failure",
      tasks: [
        { key: "t1", label: "ok", target_type: "internal_operator", target_app: "test_app", target_capability: "ok_op", input: {} },
        { key: "t2", label: "fail", target_type: "internal_operator", target_app: "test_app", target_capability: "fail_op", input: {} },
        { key: "t3", label: "skipped", target_type: "internal_operator", target_app: "test_app", target_capability: "never_dispatched", input: {} },
      ],
    };

    const summary = await runWorkflow(workflow, makeCtx(), harness.deps);

    expect(summary.ok).toBe(false);
    expect(summary.tasks.map((t) => t.status)).toEqual(["completed", "failed"]);
    expect(summary.tasks[1].error).toMatchObject({ class: "internal_error", message: "boom" });
    expect(failExecutor).toHaveBeenCalledTimes(1);
    expect(neverCalled).not.toHaveBeenCalled();

    // No dispatched entry for the third task either.
    const dispatched = harness.ledger.filter((e) => e.event_type === "workflow_task_dispatched");
    expect(dispatched.map((d) => d.detail.task_key)).toEqual(["t1", "t2"]);
  });

  it("does NOT halt the workflow when writeLedger fails (observability is best-effort)", async () => {
    registerOperators("test_app", [
      {
        key: "ok_op",
        description: "Always succeeds; used in ledger-failure test",
        inputs_schema: z.object({}),
        outputs_schema: z.object({ ok: z.boolean() }),
        required_tools: [],
        required_patterns: [],
        action_classes: [],
      },
    ]);

    const harness = makeHarness();
    harness.installExecutor("test_app", "ok_op", async () => ({ ok: true }));
    harness.failNextLedger(); // make the dispatched-entry write fail

    const task: WorkflowTask = {
      key: "t1",
      label: "ledger-degraded",
      target_type: "internal_operator",
      target_app: "test_app",
      target_capability: "ok_op",
      input: {},
    };

    const result = await dispatchWorkflowTask(task, {}, makeCtx(), harness.deps);

    expect(result.status).toBe("completed");
    // The completed entry still wrote (only the first write was forced to fail).
    expect(harness.ledger.map((e) => e.event_type)).toEqual(["workflow_task_completed"]);
  });
});
