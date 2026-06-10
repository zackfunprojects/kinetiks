import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @kinetiks/tools surfaces so the decision flow can be exercised
// without booting the registry. ToolError is a minimal stand-in so the
// production `err instanceof ToolError` branch resolves against the same
// class the tests throw.
vi.mock("@kinetiks/tools", () => ({
  buildCapabilityManifest: vi.fn(),
  getTool: vi.fn(),
  ToolError: class ToolError extends Error {
    errorClass: string;
    constructor(errorClass: string, message: string) {
      super(message);
      this.errorClass = errorClass;
    }
  },
}));

vi.mock("@/lib/tools/availability", () => ({
  platformAvailabilityResolvers: {},
}));

import { z } from "zod";
import {
  buildCapabilityManifest,
  getTool,
  ToolError,
} from "@kinetiks/tools";
import type { AgentRun } from "@kinetiks/runtime";
import { decideAndInvokeTool, MAX_TOOL_FANOUT } from "../tool-decision";
import type { PreAnalysisBrief } from "../types";

const mockManifest = vi.mocked(buildCapabilityManifest);
const mockGetTool = vi.mocked(getTool);

function emptyBrief(): PreAnalysisBrief {
  return {
    available_evidence: [],
    not_available: [],
    memory_facts: [],
    response_shape: {
      max_sentences: 6,
      lead_with: "",
      must_flag: [],
      must_not: [],
    },
    action_availability: [],
  };
}

function makeAgentRun(invokeImpl: (tool: unknown, input: unknown) => unknown): AgentRun {
  return {
    invokeTool: vi.fn(invokeImpl),
  } as unknown as AgentRun;
}

function makeTool(name: string, opts: { isConsequential?: boolean } = {}) {
  return {
    name,
    description: `Tool ${name}`,
    inputSchema: z.object({
      metric: z.string(),
      date_range: z.string(),
    }),
    outputSchema: z.unknown(),
    isConsequential: opts.isConsequential ?? false,
    autoApproveThreshold: null,
    availability: { kind: "always" as const },
    execute: vi.fn(),
  };
}

const ga4Tool = makeTool("ga4_query");
const stripeTool = makeTool("stripe_query");
const gscTool = makeTool("gsc_query");
const slackTool = makeTool("slack_post", { isConsequential: true });
const emailTool = makeTool("send_email", { isConsequential: true });

const TOOLS_BY_NAME: Record<string, unknown> = {
  ga4_query: ga4Tool,
  stripe_query: stripeTool,
  gsc_query: gscTool,
  slack_post: slackTool,
  send_email: emailTool,
};

/** Register the full fixture toolset in the manifest + getTool mocks. */
function registerTools() {
  mockManifest.mockResolvedValue({
    tools: Object.values(TOOLS_BY_NAME).map((t) => {
      const tool = t as { name: string; description: string; isConsequential: boolean };
      return {
        name: tool.name,
        description: tool.description,
        isConsequential: tool.isConsequential,
      };
    }),
    action_classes: [],
    operators: [],
  } as never);
  mockGetTool.mockImplementation(
    (name: string) => TOOLS_BY_NAME[name] as never,
  );
}

const validInput = { metric: "sessions", date_range: "last_7_days" };

const haikuOk = (decision: object) => async () => ({
  content: [{ text: JSON.stringify(decision) }],
});

const selection = (tool_name: string, input: unknown = validInput, reason = `use ${tool_name}`) => ({
  tool_name,
  input,
  reason,
});

beforeEach(() => {
  mockManifest.mockReset();
  mockGetTool.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("decideAndInvokeTool - no tools registered", () => {
  it("returns no observations when the registry is empty", async () => {
    mockManifest.mockResolvedValue({
      tools: [],
      action_classes: [],
      operators: [],
    } as never);

    const result = await decideAndInvokeTool({
      userMessage: "how is traffic?",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: makeAgentRun(() => null),
      haikuCaller: haikuOk({ selections: [], reason: "n/a" }),
    });

    expect(result.observations).toEqual([]);
  });
});

describe("decideAndInvokeTool - Haiku picks no tool", () => {
  it("returns no observations when selections is empty", async () => {
    registerTools();

    const result = await decideAndInvokeTool({
      userMessage: "tell me about Saturn",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: makeAgentRun(() => {
        throw new Error("should not invoke");
      }),
      haikuCaller: haikuOk({
        selections: [],
        reason: "no tool fits planetary trivia",
      }),
    });

    expect(result.observations).toEqual([]);
    expect(result.decision.selections).toEqual([]);
  });
});

describe("decideAndInvokeTool - single read tool", () => {
  it("invokes the tool via AgentRun and returns one observation", async () => {
    registerTools();

    const toolOutput = {
      status: "ok" as const,
      rows: [{ value: 1200, dimensions: {} }],
    };
    const run = makeAgentRun(async () => toolOutput);

    const result = await decideAndInvokeTool({
      userMessage: "how is traffic this week?",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        selections: [selection("ga4_query", validInput, "traffic query matches ga4_query")],
        reason: "single source answers this",
      }),
    });

    expect(result.decision.selections).toHaveLength(1);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].tool_name).toBe("ga4_query");
    expect(result.observations[0].output).toEqual(toolOutput);
    expect(run.invokeTool).toHaveBeenCalledTimes(1);
  });

  it("normalizes the legacy single-tool shape and invokes it", async () => {
    registerTools();

    const run = makeAgentRun(async () => ({ status: "ok", rows: [] }));

    const result = await decideAndInvokeTool({
      userMessage: "how is traffic this week?",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      // Legacy D1 shape: { tool_name, input, reason } with no selections array.
      haikuCaller: haikuOk({
        tool_name: "ga4_query",
        input: validInput,
        reason: "traffic query",
      }),
    });

    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].tool_name).toBe("ga4_query");
    expect(run.invokeTool).toHaveBeenCalledTimes(1);
  });

  it("returns no observations for the legacy null tool_name shape", async () => {
    registerTools();

    const result = await decideAndInvokeTool({
      userMessage: "hi",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: makeAgentRun(() => {
        throw new Error("should not invoke");
      }),
      haikuCaller: haikuOk({ tool_name: null, input: null, reason: "nothing fits" }),
    });

    expect(result.observations).toEqual([]);
  });
});

describe("decideAndInvokeTool - multi-tool fan-out", () => {
  it("invokes two read tools and returns observations in selection order", async () => {
    registerTools();

    const outputs: Record<string, unknown> = {
      ga4_query: { status: "ok", rows: [{ value: 1200 }] },
      stripe_query: { status: "ok", rows: [{ value: 8400 }] },
    };
    const run = makeAgentRun(async (tool) => outputs[(tool as { name: string }).name]);

    const result = await decideAndInvokeTool({
      userMessage: "did the pricing change move revenue for my best segment?",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        selections: [
          selection("stripe_query", validInput, "revenue evidence"),
          selection("ga4_query", validInput, "traffic evidence"),
        ],
        reason: "question spans revenue and traffic",
      }),
    });

    expect(run.invokeTool).toHaveBeenCalledTimes(2);
    expect(result.observations).toHaveLength(2);
    expect(result.observations.map((o) => o.tool_name)).toEqual([
      "stripe_query",
      "ga4_query",
    ]);
    expect(result.observations[0].output).toEqual(outputs.stripe_query);
    expect(result.observations[1].output).toEqual(outputs.ga4_query);
  });

  it("invokes three read tools concurrently (all start before any resolves)", async () => {
    registerTools();

    const started: string[] = [];
    const resolvers: Array<() => void> = [];
    const run = makeAgentRun((tool) => {
      started.push((tool as { name: string }).name);
      return new Promise((resolve) => {
        resolvers.push(() => resolve({ status: "ok", tool: (tool as { name: string }).name }));
      });
    });

    const resultPromise = decideAndInvokeTool({
      userMessage: "compare search, traffic, and revenue this month",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        selections: [
          selection("ga4_query"),
          selection("gsc_query"),
          selection("stripe_query"),
        ],
        reason: "three sources",
      }),
    });

    // Let the invocations start. All three must have begun before any
    // resolves — the sequential pattern would show only one started.
    await vi.waitFor(() => {
      expect(started).toHaveLength(3);
    });
    expect(started).toEqual(["ga4_query", "gsc_query", "stripe_query"]);

    resolvers.forEach((resolve) => resolve());
    const result = await resultPromise;
    expect(result.observations).toHaveLength(3);
  });

  it("caps the fan-out at MAX_TOOL_FANOUT read tools", async () => {
    registerTools();

    const run = makeAgentRun(async () => ({ status: "ok" }));

    const result = await decideAndInvokeTool({
      userMessage: "everything about my business",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        selections: [
          selection("ga4_query", { metric: "sessions", date_range: "a" }),
          selection("gsc_query", { metric: "clicks", date_range: "b" }),
          selection("stripe_query", { metric: "revenue", date_range: "c" }),
          selection("ga4_query", { metric: "conversions", date_range: "d" }),
        ],
        reason: "broad sweep",
      }),
    });

    expect(MAX_TOOL_FANOUT).toBe(3);
    expect(run.invokeTool).toHaveBeenCalledTimes(MAX_TOOL_FANOUT);
    expect(result.observations).toHaveLength(MAX_TOOL_FANOUT);
  });

  it("allows the same tool twice with different inputs, deduping identical pairs", async () => {
    registerTools();

    const run = makeAgentRun(async (_tool, input) => ({ status: "ok", input }));

    const result = await decideAndInvokeTool({
      userMessage: "sessions and conversions this week",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        selections: [
          selection("ga4_query", { metric: "sessions", date_range: "last_7_days" }),
          selection("ga4_query", { metric: "conversions", date_range: "last_7_days" }),
          // Exact duplicate of the first selection — must be deduped.
          selection("ga4_query", { metric: "sessions", date_range: "last_7_days" }),
        ],
        reason: "two GA4 metrics",
      }),
    });

    expect(run.invokeTool).toHaveBeenCalledTimes(2);
    expect(result.observations).toHaveLength(2);
  });

  it("fires onToolInvokeStart once per tool before its invocation resolves", async () => {
    registerTools();

    const started: string[] = [];
    const run = makeAgentRun(async (tool) => {
      // Both hooks must have fired by the time any invocation runs —
      // the hook is called synchronously before invokeTool.
      expect(started.length).toBeGreaterThan(0);
      return { status: "ok", tool: (tool as { name: string }).name };
    });

    const result = await decideAndInvokeTool({
      userMessage: "compare traffic and revenue",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        selections: [selection("ga4_query"), selection("stripe_query")],
        reason: "two sources",
      }),
      onToolInvokeStart: (toolName) => started.push(toolName),
    });

    expect(started).toEqual(["ga4_query", "stripe_query"]);
    expect(result.observations).toHaveLength(2);
  });

  it("a throwing onToolInvokeStart hook never affects the invocation", async () => {
    registerTools();

    const run = makeAgentRun(async () => ({ status: "ok" }));

    const result = await decideAndInvokeTool({
      userMessage: "how is traffic?",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        selections: [selection("ga4_query")],
        reason: "traffic",
      }),
      onToolInvokeStart: () => {
        throw new Error("status channel broke");
      },
    });

    expect(run.invokeTool).toHaveBeenCalledTimes(1);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].output).toEqual({ status: "ok" });
  });

  it("one failing tool does not drop the other tools' evidence", async () => {
    registerTools();

    const run = makeAgentRun(async (tool) => {
      if ((tool as { name: string }).name === "gsc_query") {
        throw new Error("upstream timeout");
      }
      return { status: "ok", rows: [{ value: 7 }] };
    });

    const result = await decideAndInvokeTool({
      userMessage: "compare search and traffic",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        selections: [selection("ga4_query"), selection("gsc_query")],
        reason: "two sources",
      }),
    });

    expect(result.observations).toHaveLength(2);
    expect(result.observations[0].output).toEqual({ status: "ok", rows: [{ value: 7 }] });
    const failed = result.observations[1].output as {
      status: string;
      error_class: string;
      message: string;
    };
    expect(failed.status).toBe("error");
    expect(failed.error_class).toBe("runtime_failure");
    expect(failed.message).toContain("upstream timeout");
  });

  it("drops unknown tools from the fan-out without dropping the valid ones", async () => {
    registerTools();

    const run = makeAgentRun(async () => ({ status: "ok" }));

    const result = await decideAndInvokeTool({
      userMessage: "traffic plus something imaginary",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        selections: [selection("phantom_tool", {}), selection("ga4_query")],
        reason: "one real, one hallucinated",
      }),
    });

    expect(run.invokeTool).toHaveBeenCalledTimes(1);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].tool_name).toBe("ga4_query");
  });

  it("drops selections whose input fails the tool schema, keeping the rest", async () => {
    registerTools();

    const run = makeAgentRun(async () => ({ status: "ok" }));

    const result = await decideAndInvokeTool({
      userMessage: "search and traffic",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        selections: [
          selection("gsc_query", { metric: 42 }), // invalid: metric must be a string
          selection("ga4_query"),
        ],
        reason: "two sources",
      }),
    });

    expect(run.invokeTool).toHaveBeenCalledTimes(1);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].tool_name).toBe("ga4_query");
  });
});

describe("decideAndInvokeTool - consequential tools never fan out", () => {
  it("invokes a sole consequential selection (single + gated path preserved)", async () => {
    registerTools();

    const run = makeAgentRun(async () => ({ status: "sent" }));

    const result = await decideAndInvokeTool({
      userMessage: "post to slack that we hit our goal",
      intent: "action",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        selections: [selection("slack_post")],
        reason: "explicit action request",
      }),
    });

    expect(run.invokeTool).toHaveBeenCalledTimes(1);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].tool_name).toBe("slack_post");
  });

  it("drops consequential tools from a mixed multi-selection", async () => {
    registerTools();

    const run = makeAgentRun(async () => ({ status: "ok" }));

    const result = await decideAndInvokeTool({
      userMessage: "check traffic and post the result to slack",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        selections: [selection("ga4_query"), selection("slack_post")],
        reason: "read plus action",
      }),
    });

    expect(run.invokeTool).toHaveBeenCalledTimes(1);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].tool_name).toBe("ga4_query");
  });

  it("collapses an all-consequential multi-selection to its first entry", async () => {
    registerTools();

    const run = makeAgentRun(async () => ({ status: "sent" }));

    const result = await decideAndInvokeTool({
      userMessage: "post to slack and email the team",
      intent: "action",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        selections: [selection("slack_post"), selection("send_email")],
        reason: "two actions",
      }),
    });

    expect(run.invokeTool).toHaveBeenCalledTimes(1);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].tool_name).toBe("slack_post");
  });
});

describe("decideAndInvokeTool - parse failure", () => {
  it("returns no observations on invalid Haiku JSON", async () => {
    registerTools();

    const result = await decideAndInvokeTool({
      userMessage: "hi",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: makeAgentRun(() => {
        throw new Error("should not invoke");
      }),
      haikuCaller: async () => ({ content: [{ text: "not json at all" }] }),
    });

    expect(result.observations).toEqual([]);
  });
});

describe("decideAndInvokeTool - Runtime throws during invokeTool", () => {
  it("surfaces a structured error observation rather than rethrowing", async () => {
    registerTools();

    const run = makeAgentRun(async () => {
      throw new Error("authority denied");
    });

    const result = await decideAndInvokeTool({
      userMessage: "how is traffic?",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        selections: [selection("ga4_query")],
        reason: "traffic query",
      }),
    });

    expect(result.observations).toHaveLength(1);
    const output = result.observations[0].output as {
      status: string;
      error_class: string;
      message: string;
    };
    expect(output.status).toBe("error");
    expect(output.error_class).toBe("runtime_failure");
    expect(output.message).toContain("authority denied");
  });
});

describe("decideAndInvokeTool - action queued for approval", () => {
  it("surfaces a truthful queued observation (never implies the action ran)", async () => {
    registerTools();

    const run = makeAgentRun(async () => {
      throw new ToolError(
        "queued_for_approval",
        "Action queued for your approval",
      );
    });

    const result = await decideAndInvokeTool({
      userMessage: "post to slack that we hit our goal",
      intent: "action",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        selections: [selection("slack_post")],
        reason: "explicit action request",
      }),
    });

    expect(result.observations).toHaveLength(1);
    const output = result.observations[0].output as {
      status: string;
      message: string;
    };
    expect(output.status).toBe("queued_for_approval");
    expect(output.message).toMatch(/has not run yet/);
  });

  it("surfaces a truthful denied observation", async () => {
    registerTools();

    const run = makeAgentRun(async () => {
      throw new ToolError(
        "denied_by_authority",
        "Denied by authority settings",
      );
    });

    const result = await decideAndInvokeTool({
      userMessage: "post to slack that we hit our goal",
      intent: "action",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        selections: [selection("slack_post")],
        reason: "explicit action request",
      }),
    });

    expect(result.observations).toHaveLength(1);
    const output = result.observations[0].output as {
      status: string;
      message: string;
    };
    expect(output.status).toBe("denied");
    expect(output.message).toMatch(/did not run/);
  });
});
