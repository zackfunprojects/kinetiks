import { describe, it, expect } from "vitest";
import type { SynapseCommand, CommandResponse, CommandProgress } from "@kinetiks/synapse";
import { planDispatchOrder, dispatchCommands } from "../command-dispatcher";

function makeCommand(
  id: string,
  app: string,
  opts: { depends_on?: string[] } = {}
): SynapseCommand {
  return {
    id,
    source: "marcus",
    target_app: app,
    capability: `${app}_op`,
    type: "action",
    parameters: {},
    context: { account_id: "acc1", thread_id: "thr1" },
    timeout_ms: 30000,
    created_at: "2026-01-01T00:00:00.000Z",
    ...opts,
  };
}

/** Executor stub: records dispatch order + the (enriched) command it received. */
function makeExecutor() {
  const order: string[] = [];
  const received: SynapseCommand[] = [];
  const executor = async (command: SynapseCommand): Promise<CommandResponse> => {
    order.push(command.id);
    received.push(command);
    return {
      command_id: command.id,
      app_name: command.target_app,
      status: "success",
      data: { value: `${command.target_app}-result` },
      duration_ms: 1,
    };
  };
  return { executor, order, received };
}

describe("planDispatchOrder", () => {
  it("puts independent commands in a single parallel step", () => {
    const steps = planDispatchOrder([
      makeCommand("a", "harvest"),
      makeCommand("b", "dm"),
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0].map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("orders a linear dependency chain into sequential steps", () => {
    const steps = planDispatchOrder([
      makeCommand("c", "lt", { depends_on: ["b"] }),
      makeCommand("a", "dm"),
      makeCommand("b", "harvest", { depends_on: ["a"] }),
    ]);
    expect(steps.map((s) => s.map((c) => c.id))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("treats dependencies outside the plan as already satisfied", () => {
    const steps = planDispatchOrder([
      makeCommand("a", "harvest", { depends_on: ["not-in-plan"] }),
    ]);
    expect(steps).toEqual([[expect.objectContaining({ id: "a" })]]);
  });

  it("throws on a dependency cycle", () => {
    expect(() =>
      planDispatchOrder([
        makeCommand("a", "harvest", { depends_on: ["b"] }),
        makeCommand("b", "dm", { depends_on: ["a"] }),
      ])
    ).toThrow(/cyclic|unresolvable/i);
  });
});

describe("dispatchCommands", () => {
  it("dispatches dependent commands after their dependencies and hands off results", async () => {
    const { executor, order, received } = makeExecutor();
    const commands = [
      makeCommand("b", "harvest", { depends_on: ["a"] }),
      makeCommand("a", "dm"),
    ];

    await dispatchCommands(commands, { executor });

    // a (no deps) runs before b (depends on a)
    expect(order).toEqual(["a", "b"]);

    // b received a's result injected into context.prior_results, keyed by app.
    const bReceived = received.find((c) => c.id === "b")!;
    expect(bReceived.context.prior_results).toEqual({ dm: { value: "dm-result" } });

    // a, with no deps, has no prior_results.
    const aReceived = received.find((c) => c.id === "a")!;
    expect(aReceived.context.prior_results).toBeUndefined();
  });

  it("emits progress for each command and reaches 100%", async () => {
    const { executor } = makeExecutor();
    const progress: CommandProgress[] = [];
    await dispatchCommands(
      [makeCommand("a", "dm"), makeCommand("b", "harvest")],
      { executor, onProgress: (p) => progress.push(p) }
    );

    const steps = progress.map((p) => p.step);
    expect(steps.filter((s) => s === "dispatching")).toHaveLength(2);
    expect(steps.filter((s) => s === "complete")).toHaveLength(2);
    expect(progress[progress.length - 1].progress).toBe(100);
  });

  it("returns responses in the original command order", async () => {
    const { executor } = makeExecutor();
    const responses = await dispatchCommands(
      [makeCommand("z", "dm"), makeCommand("y", "harvest", { depends_on: ["z"] })],
      { executor }
    );
    expect(responses.map((r) => r.command_id)).toEqual(["z", "y"]);
  });

  it("isolates a failing command without dropping the rest", async () => {
    const executor = async (command: SynapseCommand): Promise<CommandResponse> => {
      if (command.id === "bad") throw new Error("boom");
      return {
        command_id: command.id,
        app_name: command.target_app,
        status: "success",
        data: {},
        duration_ms: 1,
      };
    };
    const responses = await dispatchCommands(
      [makeCommand("bad", "dm"), makeCommand("ok", "harvest")],
      { executor }
    );
    const bad = responses.find((r) => r.command_id === "bad")!;
    const ok = responses.find((r) => r.command_id === "ok")!;
    expect(bad.status).toBe("error");
    expect(bad.error).toContain("boom");
    expect(ok.status).toBe("success");
  });
});
