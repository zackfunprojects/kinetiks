import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { configureToolCallLogger, registerTool } from "@kinetiks/tools";
import type { ToolCallLogPayload } from "@kinetiks/tools";
import { startAgentRun } from "@kinetiks/runtime";

// Mock the ga4_query collaborators so the tool runs deterministically.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ __admin: true })),
}));

vi.mock("@/lib/connections/manager", () => ({
  getConnectionByProvider: vi.fn(async () => ({
    id: "c1",
    account_id: "acc-proof",
    provider: "ga4",
    status: "active",
    credentials: {},
    last_sync_at: null,
    metadata: { property_id: "p-1" },
    created_at: "2026-01-01T00:00:00Z",
  })),
}));

vi.mock("@/lib/connections/metric-cache", () => ({
  cacheStatus: vi.fn(),
  getCachedMetric: vi.fn(async () => ({
    id: "row-cached",
    account_id: "acc-proof",
    source: "ga4",
    normalized_input_hash: "test-hash",
    input: {},
    response: {
      rows: [{ dimensions: {}, value: 4321 }],
      metric: "ga4_sessions",
      metric_unit: "count",
      date_range: { start: "7daysAgo", end: "today" },
      property_id: "p-1",
    },
    refreshed_at: "2026-05-17T01:00:00Z",
    stale_after_seconds: 900,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    provider_etag: null,
    error_state: null,
    created_at: "2026-05-17T01:00:00Z",
    updated_at: "2026-05-17T01:00:00Z",
  })),
  isFresh: vi.fn(() => true),
  normalizeInput: vi.fn(() => ({ canonical: {}, hash: "test-hash" })),
  withRefreshLock: vi.fn(),
  writeCachedMetric: vi.fn(),
}));

vi.mock("@/lib/connections/refresh-token", () => ({
  withFreshToken: vi.fn(),
}));

vi.mock("@/lib/connections/extractors/ga4", async () => {
  const actual = await vi.importActual<typeof import("@/lib/connections/extractors/ga4")>(
    "@/lib/connections/extractors/ga4"
  );
  return {
    ...actual,
    createGa4Client: vi.fn(),
    runGa4Query: vi.fn(),
  };
});

// Mock the registry boot path's other tools so this file's registerTool
// call is the only insertion.
vi.mock("@kinetiks/tools", async () => {
  const actual = await vi.importActual<typeof import("@kinetiks/tools")>(
    "@kinetiks/tools"
  );
  return actual;
});

import { ga4QueryTool } from "@/lib/tools/ga4-query";
import { decideAndInvokeTool } from "../tool-decision";
import {
  _resetToolRegistryForTests,
} from "@kinetiks/tools";

// Capture tool_calls logger emissions to assert correlation.
const capturedLogs: ToolCallLogPayload[] = [];

beforeAll(() => {
  _resetToolRegistryForTests();
  configureToolCallLogger((payload) => {
    capturedLogs.push(payload);
  });
  registerTool(ga4QueryTool);
});

afterAll(() => {
  _resetToolRegistryForTests();
  configureToolCallLogger(null);
});

beforeEach(() => {
  capturedLogs.length = 0;
});

describe("D1 proof point — Marcus tool-use turn invokes ga4_query end-to-end", () => {
  it("the Haiku-driven decision -> AgentRun -> ga4_query path links tool_calls to the agent run", async () => {
    const run = startAgentRun({
      accountId: "acc-proof",
      invokedByAgent: "marcus",
      threadId: "thread-proof",
    });

    const haikuCaller = async () => ({
      content: [
        {
          text: JSON.stringify({
            tool_name: "ga4_query",
            input: {
              metric: "ga4_sessions",
              date_range: "last_7_days",
            },
            reason: "user asked about traffic this week",
          }),
        },
      ],
    });

    const result = await decideAndInvokeTool({
      userMessage: "how is traffic this week?",
      intent: "question",
      brief: {
        available_evidence: [],
        not_available: [],
        memory_facts: [],
        response_shape: {
          max_sentences: 6,
          lead_with: "Answer directly",
          must_flag: [],
          must_not: [],
        },
        action_availability: [],
      },
      accountId: "acc-proof",
      agentRun: run,
      haikuCaller,
    });

    run.end();

    // The proof: Marcus's tool-decision Haiku chose ga4_query, the
    // Runtime invoked it, and the cached row's value (4321) appears in
    // the structured observation Sonnet will see.
    expect(result.observation).not.toBeNull();
    expect(result.observation?.tool_name).toBe("ga4_query");
    const output = result.observation?.output as {
      status: string;
      rows: Array<{ value: number }>;
      cache_status: string;
    };
    expect(output.status).toBe("ok");
    expect(output.rows[0].value).toBe(4321);
    expect(output.cache_status).toBe("fresh");

    // tool_calls row is emitted via the configured logger, carrying the
    // agent_run_id correlation back to the Marcus turn.
    const ga4Log = capturedLogs.find((p) => p.toolName === "ga4_query");
    expect(ga4Log).toBeDefined();
    expect(ga4Log?.accountId).toBe("acc-proof");
    expect(ga4Log?.agentRunId).toBe(run.runId);
    expect(ga4Log?.threadId).toBe("thread-proof");
    expect(ga4Log?.status).toBe("success");
    expect(ga4Log?.isConsequential).toBe(false);
  });
});
