import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * B2 — SSE protocol tests for the streaming pipeline.
 *
 * The product promise: the silent 1.5-3s before the first token renders
 * as visible agent work. These tests pin the event ORDER the client
 * depends on:
 *
 *   thread_id
 *     -> status(intent) -> status(brief) -> status(tool_decision)
 *     -> status(tool_exec, per tool) -> status(responding)
 *     -> text deltas -> done
 *
 * and the error contract (error event + actionsPromise resolves empty).
 */

vi.mock("@kinetiks/ai", () => ({
  routeAskClaude: vi.fn(async () => "{}"),
  routeAskClaudeMultiTurn: vi.fn(async () => "unused in streaming"),
  routeStreamClaude: vi.fn(),
}));

vi.mock("@kinetiks/runtime", () => ({
  startAgentRun: vi.fn(),
}));

vi.mock("@kinetiks/tools", () => ({
  getTool: vi.fn(() => undefined),
}));

vi.mock("../intent", () => ({
  classifyIntent: vi.fn(async () => "question"),
}));

vi.mock("../context-assembly", () => ({
  assembleContext: vi.fn(),
  buildDataAvailabilityManifest: vi.fn(async () => ({
    cortex_coverage: { overall_confidence: 50, layers: [] },
    connections: [],
    available_data: [],
    known_gaps: [],
    data_freshness: [],
  })),
}));

vi.mock("../tool-bridge", () => ({
  buildToolInventoryForBrief: vi.fn(async () => undefined),
}));

vi.mock("../thread-manager", () => ({
  getOrCreateThread: vi.fn(async () => ({ id: "thread-1", title: null })),
  addMessage: vi.fn(async () => ({ id: "msg-1" })),
  getRecentThreadMessages: vi.fn(async () => []),
  autoTitleThread: vi.fn(async () => undefined),
}));

vi.mock("../memory", () => ({
  loadThreadMemories: vi.fn(async () => []),
  extractAndPersistMemories: vi.fn(async () => undefined),
  formatMemoriesForContext: vi.fn(() => ""),
}));

vi.mock("@/lib/oracle/insights/reader", () => ({
  loadInsightsForBrief: vi.fn(async () => []),
}));

vi.mock("@/lib/oracle/insights/delivery", () => ({
  stampDeliveredFromResponse: vi.fn(async () => undefined),
}));

vi.mock("../patterns-for-brief", () => ({
  loadPatternsForBrief: vi.fn(async () => []),
}));

vi.mock("@/lib/patterns/emit-internal", () => ({
  closeConnectionEvidenceObservation: vi.fn(async () => undefined),
  closeMarcusTurnObservationForThread: vi.fn(async () => undefined),
  recordConnectionEvidenceObservation: vi.fn(async () => undefined),
  recordInsightDeliveryObservation: vi.fn(async () => undefined),
  recordMarcusTurnObservation: vi.fn(async () => undefined),
}));

vi.mock("../action-generator", () => ({
  generateActions: vi.fn(async () => ({ actions: [], footer_text: "" })),
}));

vi.mock("../tool-decision", () => ({
  decideAndInvokeTool: vi.fn(),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { routeAskClaude, routeStreamClaude } from "@kinetiks/ai";
import { startAgentRun } from "@kinetiks/runtime";
import { decideAndInvokeTool } from "../tool-decision";
import { streamMarcusMessage } from "../engine";

const mockRouteAskClaude = vi.mocked(routeAskClaude);
const mockRouteStreamClaude = vi.mocked(routeStreamClaude);
const mockStartAgentRun = vi.mocked(startAgentRun);
const mockDecideAndInvokeTool = vi.mocked(decideAndInvokeTool);

interface SseEvent {
  type: string;
  [key: string]: unknown;
}

/** Drain the engine's ReadableStream and parse every SSE event. */
async function readAllEvents(stream: ReadableStream): Promise<SseEvent[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: SseEvent[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value as Uint8Array, { stream: true });
  }
  for (const line of buffer.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const jsonStr = line.slice(6).trim();
    if (jsonStr) events.push(JSON.parse(jsonStr) as SseEvent);
  }
  return events;
}

function makeAdminStub(systemName: string | null = "Atlas"): SupabaseClient {
  return {
    from: vi.fn((table: string) => {
      if (table === "kinetiks_ledger") {
        return { insert: vi.fn(() => Promise.resolve({ error: null })) };
      }
      if (table === "kinetiks_accounts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { system_name: systemName },
                error: null,
              })),
            })),
          })),
        };
      }
      return {
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
        insert: vi.fn(() => Promise.resolve({ error: null })),
      };
    }),
  } as unknown as SupabaseClient;
}

function makeRun() {
  return {
    runId: "run-1",
    end: vi.fn(),
    invokeTool: vi.fn(),
  };
}

const briefJson = JSON.stringify({
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
});

async function* sonnetDeltas(...chunks: string[]) {
  for (const text of chunks) {
    yield {
      type: "content_block_delta" as const,
      delta: { type: "text_delta" as const, text },
    };
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStartAgentRun.mockReturnValue(makeRun() as never);
  mockRouteAskClaude.mockResolvedValue(briefJson);
  mockRouteStreamClaude.mockResolvedValue(sonnetDeltas("Hello", " there.") as never);
  mockDecideAndInvokeTool.mockResolvedValue({
    observations: [],
    decision: { selections: [], reason: "nothing fits" },
  } as never);
});

describe("streamMarcusMessage - SSE status protocol", () => {
  it("emits thread_id, then status events in pipeline order, before any text", async () => {
    const { stream, threadId } = await streamMarcusMessage(
      makeAdminStub(),
      "acc-1",
      "how is traffic?",
    );

    expect(threadId).toBe("thread-1");
    const events = await readAllEvents(stream);

    expect(events[0]).toEqual({ type: "thread_id", thread_id: "thread-1" });

    const stages = events
      .filter((e) => e.type === "status")
      .map((e) => e.stage);
    expect(stages).toEqual(["intent", "brief", "tool_decision", "responding"]);

    // Every status event precedes the first text delta.
    const firstTextIdx = events.findIndex((e) => e.type === "text");
    const lastStatusIdx = events
      .map((e, i) => (e.type === "status" ? i : -1))
      .filter((i) => i >= 0)
      .pop();
    expect(firstTextIdx).toBeGreaterThan(lastStatusIdx ?? Infinity);

    // Text deltas arrive intact and the stream terminates with done.
    const text = events
      .filter((e) => e.type === "text")
      .map((e) => e.text)
      .join("");
    expect(text).toBe("Hello there.");
    expect(events[events.length - 1]).toEqual({ type: "done" });

    // Status labels are customer-facing strings.
    const labels = events
      .filter((e) => e.type === "status")
      .map((e) => e.label);
    expect(labels).toEqual([
      "Reading your question",
      "Reviewing what I know",
      "Choosing data sources",
      "Writing",
    ]);
  });

  it("emits a tool_exec status per invoked tool during fan-out", async () => {
    mockDecideAndInvokeTool.mockImplementation(async (input) => {
      // Mirror production: the hook fires once per tool at invocation start.
      input.onToolInvokeStart?.("ga4_query");
      input.onToolInvokeStart?.("stripe_query");
      return {
        observations: [
          { tool_name: "ga4_query", reason: "traffic", output: { status: "ok" } },
          { tool_name: "stripe_query", reason: "revenue", output: { status: "ok" } },
        ],
        decision: {
          selections: [
            { tool_name: "ga4_query", input: {}, reason: "traffic" },
            { tool_name: "stripe_query", input: {}, reason: "revenue" },
          ],
          reason: "two sources",
        },
      } as never;
    });

    const { stream } = await streamMarcusMessage(
      makeAdminStub(),
      "acc-1",
      "did the pricing change move revenue for my best segment?",
    );
    const events = await readAllEvents(stream);

    const toolStatuses = events.filter(
      (e) => e.type === "status" && e.stage === "tool_exec",
    );
    expect(toolStatuses).toEqual([
      {
        type: "status",
        stage: "tool_exec",
        label: "Checking GA4",
        tool_name: "ga4_query",
      },
      {
        type: "status",
        stage: "tool_exec",
        label: "Checking Stripe",
        tool_name: "stripe_query",
      },
    ]);

    // tool_exec statuses sit between tool_decision and responding.
    const stages = events
      .filter((e) => e.type === "status")
      .map((e) => e.stage);
    expect(stages).toEqual([
      "intent",
      "brief",
      "tool_decision",
      "tool_exec",
      "tool_exec",
      "responding",
    ]);
  });

  it("speaks as the account's named system, never as Marcus (B3)", async () => {
    const { stream } = await streamMarcusMessage(
      makeAdminStub("Atlas"),
      "acc-1",
      "how is traffic?",
    );
    await readAllEvents(stream);

    expect(mockRouteStreamClaude).toHaveBeenCalledTimes(1);
    const systemPrompt = mockRouteStreamClaude.mock.calls[0][2] as string;
    expect(systemPrompt).toContain("You are Atlas");
    // The internal operator name never reaches the persona identity.
    expect(systemPrompt).not.toContain("You are Marcus");
  });

  it("falls back to Kinetiks before the system is named (B3)", async () => {
    const { stream } = await streamMarcusMessage(
      makeAdminStub(null),
      "acc-1",
      "how is traffic?",
    );
    await readAllEvents(stream);

    const systemPrompt = mockRouteStreamClaude.mock.calls[0][2] as string;
    expect(systemPrompt).toContain("You are Kinetiks");
  });

  it("emits an error event and resolves actionsPromise empty when the pipeline throws", async () => {
    mockDecideAndInvokeTool.mockRejectedValue(new Error("registry exploded"));

    const run = makeRun();
    mockStartAgentRun.mockReturnValue(run as never);

    const { stream, actionsPromise } = await streamMarcusMessage(
      makeAdminStub(),
      "acc-1",
      "how is traffic?",
    );
    const events = await readAllEvents(stream);

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent?.error).toContain("registry exploded");
    expect(events.some((e) => e.type === "text")).toBe(false);
    expect(events.some((e) => e.type === "done")).toBe(false);

    await expect(actionsPromise).resolves.toEqual({
      actions: [],
      footer_text: "",
    });

    // The run is ended on the error path too (telemetry parity).
    expect(run.end).toHaveBeenCalled();
  });
});
