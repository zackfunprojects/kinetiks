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
import { decideAndInvokeTool } from "../tool-decision";
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

const fakeTool = {
  name: "ga4_query",
  description: "Query GA4",
  inputSchema: z.object({
    metric: z.enum(["ga4_sessions"] as ["ga4_sessions"]),
    date_range: z.enum(["last_7_days"] as ["last_7_days"]),
  }),
  outputSchema: z.unknown(),
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "always" as const },
  execute: vi.fn(),
};

const haikuOk = (decision: object) => async () => ({
  content: [{ text: JSON.stringify(decision) }],
});

beforeEach(() => {
  mockManifest.mockReset();
  mockGetTool.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("decideAndInvokeTool - no tools registered", () => {
  it("returns observation: null when the registry is empty", async () => {
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
      haikuCaller: haikuOk({ tool_name: null, input: null, reason: "n/a" }),
    });

    expect(result.observation).toBeNull();
  });
});

describe("decideAndInvokeTool - Haiku picks no tool", () => {
  it("returns observation: null when tool_name is null", async () => {
    mockManifest.mockResolvedValue({
      tools: [
        {
          name: "ga4_query",
          description: "Query GA4",
          isConsequential: false,
        },
      ],
      action_classes: [],
      operators: [],
    } as never);

    const result = await decideAndInvokeTool({
      userMessage: "tell me about Saturn",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: makeAgentRun(() => {
        throw new Error("should not invoke");
      }),
      haikuCaller: haikuOk({
        tool_name: null,
        input: null,
        reason: "no tool fits planetary trivia",
      }),
    });

    expect(result.observation).toBeNull();
    expect(result.decision.tool_name).toBeNull();
  });
});

describe("decideAndInvokeTool - Haiku picks ga4_query", () => {
  it("invokes the tool via AgentRun and returns the observation", async () => {
    mockManifest.mockResolvedValue({
      tools: [
        {
          name: "ga4_query",
          description: "Query GA4",
          isConsequential: false,
        },
      ],
      action_classes: [],
      operators: [],
    } as never);
    mockGetTool.mockReturnValue(fakeTool as never);

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
        tool_name: "ga4_query",
        input: { metric: "ga4_sessions", date_range: "last_7_days" },
        reason: "traffic query matches ga4_query",
      }),
    });

    expect(result.decision.tool_name).toBe("ga4_query");
    expect(result.observation).not.toBeNull();
    expect(result.observation?.tool_name).toBe("ga4_query");
    expect(result.observation?.output).toEqual(toolOutput);
    expect(run.invokeTool).toHaveBeenCalledTimes(1);
  });
});

describe("decideAndInvokeTool - input fails schema validation", () => {
  it("declines invocation when the proposed input does not match the schema", async () => {
    mockManifest.mockResolvedValue({
      tools: [
        {
          name: "ga4_query",
          description: "Query GA4",
          isConsequential: false,
        },
      ],
      action_classes: [],
      operators: [],
    } as never);
    mockGetTool.mockReturnValue(fakeTool as never);

    const run = makeAgentRun(() => {
      throw new Error("should not invoke");
    });

    const result = await decideAndInvokeTool({
      userMessage: "how is traffic this week?",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        tool_name: "ga4_query",
        // metric is misspelled — schema requires literal "ga4_sessions"
        input: { metric: "ga4_session", date_range: "last_7_days" },
        reason: "traffic query",
      }),
    });

    expect(result.observation).toBeNull();
    expect(run.invokeTool).not.toHaveBeenCalled();
  });
});

describe("decideAndInvokeTool - unknown tool name", () => {
  it("declines invocation when Haiku names a tool the registry does not have", async () => {
    mockManifest.mockResolvedValue({
      tools: [
        {
          name: "ga4_query",
          description: "Query GA4",
          isConsequential: false,
        },
      ],
      action_classes: [],
      operators: [],
    } as never);
    // getTool returns undefined (it does not throw) for an unknown name.
    mockGetTool.mockReturnValue(undefined as never);

    const result = await decideAndInvokeTool({
      userMessage: "hi",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: makeAgentRun(() => {
        throw new Error("should not invoke");
      }),
      haikuCaller: haikuOk({
        tool_name: "phantom_tool",
        input: {},
        reason: "made up",
      }),
    });

    expect(result.observation).toBeNull();
  });
});

describe("decideAndInvokeTool - parse failure", () => {
  it("returns observation: null on invalid Haiku JSON", async () => {
    mockManifest.mockResolvedValue({
      tools: [
        {
          name: "ga4_query",
          description: "Query GA4",
          isConsequential: false,
        },
      ],
      action_classes: [],
      operators: [],
    } as never);

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

    expect(result.observation).toBeNull();
  });
});

describe("decideAndInvokeTool - Runtime throws during invokeTool", () => {
  it("surfaces a structured error observation rather than rethrowing", async () => {
    mockManifest.mockResolvedValue({
      tools: [
        {
          name: "ga4_query",
          description: "Query GA4",
          isConsequential: false,
        },
      ],
      action_classes: [],
      operators: [],
    } as never);
    mockGetTool.mockReturnValue(fakeTool as never);

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
        tool_name: "ga4_query",
        input: { metric: "ga4_sessions", date_range: "last_7_days" },
        reason: "traffic query",
      }),
    });

    expect(result.observation).not.toBeNull();
    const output = result.observation?.output as {
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
    mockManifest.mockResolvedValue({
      tools: [
        { name: "ga4_query", description: "Query GA4", isConsequential: false },
      ],
      action_classes: [],
      operators: [],
    } as never);
    mockGetTool.mockReturnValue(fakeTool as never);

    const run = makeAgentRun(async () => {
      throw new ToolError(
        "queued_for_approval",
        "Action queued for your approval",
      );
    });

    const result = await decideAndInvokeTool({
      userMessage: "post to slack that we hit our goal",
      intent: "question",
      brief: emptyBrief(),
      accountId: "acc-1",
      agentRun: run,
      haikuCaller: haikuOk({
        tool_name: "ga4_query",
        input: { metric: "ga4_sessions", date_range: "last_7_days" },
        reason: "fixture",
      }),
    });

    expect(result.observation).not.toBeNull();
    const output = result.observation?.output as {
      status: string;
      message: string;
    };
    expect(output.status).toBe("queued_for_approval");
    expect(output.message).toMatch(/has not run yet/);
  });
});
