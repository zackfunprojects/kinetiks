import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarcusChannel, MarcusChatResponse } from "@kinetiks/types";
import type { AICallContext, RouterConversationMessage as ConversationMessage } from "@kinetiks/ai";
import { routeAskClaude, routeAskClaudeMultiTurn, routeStreamClaude } from "@kinetiks/ai";
import { startAgentRun } from "@kinetiks/runtime";
import { classifyIntent } from "./intent";
import { assembleContext, buildDataAvailabilityManifest } from "./context-assembly";
import { buildToolInventoryForBrief } from "./tool-bridge";
import {
  getOrCreateThread,
  addMessage,
  getRecentThreadMessages,
  autoTitleThread,
} from "./thread-manager";
import { loadThreadMemories, extractAndPersistMemories } from "./memory";
import { buildPreAnalysisBrief, formatBriefForSonnet } from "./pre-analysis";
import type { ToolObservation } from "./pre-analysis";
import { loadInsightsForBrief } from "@/lib/oracle/insights/reader";
import { loadPatternsForBrief } from "./patterns-for-brief";
import { stampDeliveredFromResponse } from "@/lib/oracle/insights/delivery";
import {
  closeConnectionEvidenceObservation,
  closeMarcusTurnObservationForThread,
  recordConnectionEvidenceObservation,
  recordInsightDeliveryObservation,
  recordMarcusTurnObservation,
} from "@/lib/patterns/emit-internal";
import { getTool } from "@kinetiks/tools";
import { buildPersonaPrompt } from "./prompts/marcus-persona";
import { generateActions } from "./action-generator";
import { assembleResponse } from "./response-assembler";
import { decideAndInvokeTool } from "./tool-decision";
import { statusEvent, toolExecStatusEvent } from "./chat-status";
import type { DataAvailabilityManifest, ActionGenerationResult } from "./types";

/**
 * Build a task-bound Haiku caller for sub-modules. Each sub-module
 * (pre-analysis, action-generator, memory) is invoked with a caller
 * already tagged with its prompt task, so every `ai_calls` row is
 * correctly attributed and correlated.
 */
function makeHaikuCaller(task: string, context: AICallContext) {
  return async (prompt: string) => {
    const text = await routeAskClaude(task, prompt, undefined, {
      maxTokens: 1024,
      context,
    });
    return { content: [{ text }] };
  };
}

/**
 * Phase 1.7.1 — type-narrow the discriminated-union output of
 * connection-backed tools (ga4_query, gsc_query). Both return
 * { status: "ok" | "not_connected" | "no_property" | "no_data" |
 * "error"; ... }. Only "ok" represents evidence consumption; the other
 * statuses are operational signals (provider not connected, no
 * property picked, cache empty, upstream error) and must not count
 * toward the kinetiks_id.connection_value_per_source usefulness rate.
 *
 * Returns the status string when the output is shaped that way, or
 * undefined when the tool returned a non-discriminated value (or no
 * tool was invoked). Other tools that don't follow the status union
 * will return undefined and skip the connection-evidence path entirely.
 */
function readToolOutputStatus(
  observation: { output: unknown } | null,
): string | undefined {
  if (!observation) return undefined;
  const out = observation.output;
  if (out && typeof out === "object" && "status" in out) {
    const status = (out as { status: unknown }).status;
    return typeof status === "string" ? status : undefined;
  }
  return undefined;
}

/**
 * Phase 1.7.1 — open a kinetiks_id.connection_value_per_source
 * observation per invoked tool that surfaced evidence from a
 * connection-backed provider. With B1 fan-out, each tool in the turn is
 * its own evidence event, so each qualifying observation gets its own
 * request id. Returns the request ids so the caller can close them
 * after the observations are rendered into the brief (brief inclusion
 * is the deterministic outcome=1 signal).
 *
 * Awaited so the close finds the rows; the underlying record helper is
 * itself try/catch-wrapped and returns silently on failure.
 *
 * GATE on each tool output's status="ok". Connection-backed tools
 * (ga4_query, gsc_query) return a discriminated union: "ok" is the only
 * branch that actually carries evidence; "not_connected", "no_property",
 * "no_data", "error" are operational signals. Counting those as
 * outcome=1 would inflate the usefulness rate.
 */
async function recordConnectionEvidenceForObservations(
  admin: SupabaseClient,
  accountId: string,
  observations: ToolObservation[],
): Promise<string[]> {
  const requestIds: string[] = [];
  for (const observation of observations) {
    if (readToolOutputStatus(observation) !== "ok") continue;
    const invokedTool = getTool(observation.tool_name);
    if (!invokedTool?.connection_provider) continue;
    const requestId = crypto.randomUUID();
    requestIds.push(requestId);
    await recordConnectionEvidenceObservation(
      {
        account_id: accountId,
        provider: invokedTool.connection_provider,
        layer: invokedTool.cortex_layer ?? "none",
        query_class_hint: invokedTool.name,
        request_id: requestId,
      },
      admin,
    );
  }
  return requestIds;
}

/**
 * Close the connection-evidence observations opened above with
 * outcome=1 (brief inclusion). Fire-and-forget per id; never blocks
 * the response.
 */
function closeConnectionEvidenceForRequestIds(
  admin: SupabaseClient,
  accountId: string,
  requestIds: string[],
): void {
  for (const requestId of requestIds) {
    closeConnectionEvidenceObservation(
      {
        account_id: accountId,
        request_id: requestId,
        outcome_recorded_via: "marcus_brief_inclusion",
      },
      admin,
    ).catch(() => undefined);
  }
}

/**
 * Process a Marcus conversation message through the v2 pipeline.
 *
 * V2 Pipeline:
 * 1. Get or create thread (validates ownership)
 * 2. Fetch prior history
 * 3. Classify intent
 * 4. Save user message
 * 5. Build data availability manifest
 * 6. Load thread memories
 * 7. Pre-analysis brief (Haiku) - THE KEY CHANGE
 * 8. Response generation (Sonnet) with short persona prompt + brief adjacent to question
 * 9. Action generation + memory update (parallel, Haiku)
 * 10. Assemble response + action footer
 * 11. Save Marcus response
 * 12. Log to ledger, auto-title
 * 13. Return
 */
export async function processMarcusMessage(
  admin: SupabaseClient,
  accountId: string,
  message: string,
  threadId?: string,
  channel: MarcusChannel = "web"
): Promise<MarcusChatResponse & { _validation?: ValidationMetadata; manifest?: DataAvailabilityManifest }> {
  // 1. Get or create thread (validates ownership before any reads)
  const thread = await getOrCreateThread(admin, accountId, threadId, channel);

  // Run-scoped context: every AI call this turn gets the agent_run_id +
  // thread_id stamped on its ai_calls row, so the full Marcus turn is
  // queryable as one trace.
  const run = startAgentRun({
    accountId,
    invokedByAgent: "marcus",
    threadId: thread.id,
  });
  const aiContext: AICallContext = {
    accountId,
    threadId: thread.id,
    agentRunId: run.runId,
  };
  const haikuFor = (task: string) => makeHaikuCaller(task, aiContext);

  // 2. Fetch prior history BEFORE saving user message to avoid duplication
  const history = await getRecentThreadMessages(admin, thread.id, 20);

  // 3. Classify intent using recent history
  const recentContent = history.slice(-5).map((m) => m.content);
  const intent = await classifyIntent(message, recentContent.length > 0 ? recentContent : undefined, aiContext);

  // 4. Save user message (after history fetch to prevent it appearing in history)
  await addMessage(admin, thread.id, "user", message, channel);

  // Phase 1.7 — close any prior pending kinetiks_id.marcus_question_resonance
  // observation for this thread with outcome=1 (the user followed up).
  // Fire and forget; never blocks the response.
  closeMarcusTurnObservationForThread(
    { account_id: accountId, thread_id: thread.id },
    admin,
  ).catch(() => undefined);

  // 5. Build data availability manifest
  const manifest = await buildDataAvailabilityManifest(accountId, admin);

  // 6. Load thread memories
  const memories = await loadThreadMemories(accountId, thread.id, admin);

  // Format recent messages for context (last 3 turns)
  const recentMessages = history
    .slice(-6) // 3 turns = 6 messages (user + assistant pairs)
    .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
    .join("\n");

  // 7. Pre-analysis brief (Haiku) — pre-fetch the platform tool
  // inventory so the brief includes the canonical capability list.
  const toolInventory = await buildToolInventoryForBrief({ accountId }).catch(
    () => undefined,
  );
  // D2 Slice 11 — recent undelivered Oracle insights so Sonnet can weave
  // them into the response. Engine post-processes the response text to
  // stamp delivered=true on cited insight_ids (see step 11.5).
  const insightProjections = await loadInsightsForBrief({
    admin,
    accountId,
  }).catch(() => []);
  const briefInsights = insightProjections.map((p) => ({
    insight_id: p.insight_id,
    type: p.type,
    severity: p.severity,
    source_app: p.source_app,
    summary: p.summary,
  }));

  // Phase 1.7 — kinetiks_id.insight_action_rate observation per surfaced
  // insight. See the streaming path for the full rationale.
  for (const bi of briefInsights) {
    recordInsightDeliveryObservation(
      {
        account_id: accountId,
        insight_id: bi.insight_id,
        insight_category: bi.type ?? "recommendation",
        severity: bi.severity ?? "low",
        urgency_hint: "this_week",
      },
      admin,
    ).catch(() => undefined);
  }

  // L1a — passive Pattern Library pre-fetch per Kinetiks Contract Addendum §1.10.
  const briefPatterns = await loadPatternsForBrief({
    admin,
    account_id: accountId,
  });
  const { brief, formatted: briefText } = await buildPreAnalysisBrief(
    message,
    manifest,
    memories,
    intent,
    recentMessages,
    haikuFor("marcus.pre_analysis"),
    toolInventory,
    briefInsights,
    briefPatterns,
  );
  // 7.5. Tool decision + invocation (D1, fan-out per B1). A Haiku picks
  // which registered tools would directly answer the question — up to
  // three non-consequential reads when the question spans multiple data
  // sources, one tool otherwise. The Runtime invokes them (concurrently
  // when several) and we re-render the brief with one
  // [TOOL OBSERVATIONS] block per tool adjacent to the user's question.
  const { observations } = await decideAndInvokeTool({
    userMessage: message,
    intent,
    brief,
    accountId,
    agentRun: run,
    haikuCaller: haikuFor("marcus.tool_decision"),
  });

  // Phase 1.7.1 — connection_value_per_source observation per invoked
  // connection-backed tool with status="ok". See the helper for the
  // status gate rationale.
  const connectionEvidenceRequestIds =
    await recordConnectionEvidenceForObservations(admin, accountId, observations);

  const augmentedBriefText =
    observations.length > 0
      ? formatBriefForSonnet(brief, toolInventory, observations)
      : briefText;

  // Phase 1.7.1 — brief inclusion is the deterministic outcome=1 signal
  // for connection_value_per_source. The tool results have been rendered
  // into the prompt above; by definition the data fed into Sonnet's
  // reasoning context. Fire-and-forget; never blocks the response.
  closeConnectionEvidenceForRequestIds(
    admin,
    accountId,
    connectionEvidenceRequestIds,
  );

  // 8. Response generation (Sonnet) - short persona prompt + brief adjacent to question
  const systemPrompt = buildPersonaPrompt("Marcus");

  const conversationMessages: ConversationMessage[] = [
    ...history.map((m) => ({
      role: m.role === "user" ? "user" as const : "assistant" as const,
      content: m.content,
    })),
    {
      role: "user" as const,
      content: `${augmentedBriefText}\n\n[USER MESSAGE]\n${message}`,
    },
  ];

  const responseText = await routeAskClaudeMultiTurn(
    "marcus.persona_response",
    conversationMessages,
    systemPrompt,
    {
      maxTokens: 2048,
      context: aiContext,
    },
  );

  // 9. Action generation (Haiku) - runs before memory update so we can assemble and save first
  const conversationSummary = recentMessages;
  const actionResult = await generateActions(message, responseText, manifest, conversationSummary, haikuFor("marcus.action_generate"));

  // 10. Assemble response + action footer
  const finalResponse = assembleResponse(responseText, actionResult);

  // 11. Save Marcus response BEFORE mutating thread memory
  const marcusMessage = await addMessage(admin, thread.id, "marcus", finalResponse, channel);

  // Phase 1.7 — record kinetiks_id.marcus_question_resonance observation.
  // The next user turn in this thread (within the configured window)
  // closes it with outcome=1; otherwise the archivist sweep closes with
  // outcome=0. Fire and forget.
  recordMarcusTurnObservation(
    {
      account_id: accountId,
      thread_id: thread.id,
      message_id: marcusMessage.id,
      topic_hint: message,
      intent_hint: intent,
      icp_hint: "unknown",
    },
    admin,
  ).catch(() => undefined);

  // 11.5. D2 Slice 11 — stamp delivered=true on insights Sonnet cited.
  // Fire and forget; allowlist is bounded by the ids we surfaced in the
  // brief, so there's no risk of false-positive stamping.
  if (briefInsights.length > 0) {
    stampDeliveredFromResponse(
      admin,
      responseText,
      briefInsights.map((i) => i.insight_id),
    ).catch((err) =>
      console.error("[ENGINE] insight delivery stamping failed:", err),
    );
  }

  // 12. Memory update (Haiku) - non-blocking, after response is persisted
  extractAndPersistMemories(
    accountId,
    thread.id,
    message,
    responseText,
    memories,
    history.length,
    haikuFor("marcus.memory_extract"),
    admin,
  ).catch((err) => console.error("Memory extraction failed", err));

  // 13. Log to Learning Ledger (non-blocking). Target table is
  // kinetiks_ledger with the detail/source_app/source_operator columns;
  // the prior kinetiks_learning_ledger table and source/data keys never
  // existed, so every turn's log had been failing silently.
  admin.from("kinetiks_ledger").insert({
    account_id: accountId,
    event_type: "marcus_turn",
    source_app: "marcus",
    source_operator: "marcus",
    target_layer: null,
    detail: {
      thread_id: thread.id,
      intent_type: intent,
      brief_evidence_count: brief.available_evidence.length,
      brief_gap_count: brief.not_available.length,
      memory_count: memories.length,
      tool_observation_count: observations.length,
      action_count: actionResult.actions.length,
      response_length: responseText.length,
    },
  }).then(({ error }) => {
    if (error) console.error("Failed to log to ledger", error);
  });

  // Auto-title if first exchange
  if (history.length === 0 && !thread.title) {
    autoTitleThread(admin, thread.id, aiContext).catch(() => {});
  }

  // 14. End the run + return
  run.end();
  return {
    thread_id: thread.id,
    message: finalResponse,
    manifest,
    _validation: {
      original_passed: true, // v2 doesn't use post-validation
      was_rewritten: false,
      violations_caught: 0,
      sentence_count: responseText.split(/[.!?]+/).filter((s) => s.trim()).length,
      intent_type: intent,
    },
  };
}

interface ValidationMetadata {
  original_passed: boolean;
  was_rewritten: boolean;
  violations_caught: number;
  sentence_count: number;
  intent_type: string;
}

/**
 * Stream a Marcus conversation message through the v2 pipeline.
 * Returns a ReadableStream that emits SSE-formatted events.
 *
 * V2 streaming pipeline (B2: the pipeline runs INSIDE the stream so
 * each boundary emits a typed `status` event the client renders live —
 * before B2 the pre-stream work was 1.5-3s of silence):
 * - thread_id event, then status events at the intent / brief /
 *   tool-decision / per-tool-exec / responding boundaries
 * - Stream: Sonnet text deltas with persona prompt + brief adjacent to
 *   the question
 * - Post-stream: action generation + memory update
 * - Stream action footer after response completes, then `done`
 */
export async function streamMarcusMessage(
  admin: SupabaseClient,
  accountId: string,
  message: string,
  threadId?: string,
  channel: MarcusChannel = "web"
): Promise<{ stream: ReadableStream; threadId: string; actionsPromise?: Promise<ActionGenerationResult> }> {
  // 1. Get or create thread
  const thread = await getOrCreateThread(admin, accountId, threadId, channel);

  // Run-scoped context: stamps agent_run_id + thread_id on every ai_calls row.
  const run = startAgentRun({
    accountId,
    invokedByAgent: "marcus",
    threadId: thread.id,
  });
  const aiContext: AICallContext = {
    accountId,
    threadId: thread.id,
    agentRunId: run.runId,
  };
  const haikuFor = (task: string) => makeHaikuCaller(task, aiContext);

  // Promise that resolves with action generation result (for API route to execute)
  let resolveActions: (value: ActionGenerationResult) => void;
  const actionsPromise = new Promise<ActionGenerationResult>((resolve) => {
    resolveActions = resolve;
  });

  // B2 — the entire pre-stream pipeline (steps 2-9) runs INSIDE the
  // ReadableStream so each boundary can emit a typed status event the
  // client renders live. Before B2 this work completed before the
  // Response was even constructed, leaving the customer staring at
  // 1.5-3s of silence before the first token.
  const readableStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // A client disconnect mid-pipeline makes enqueue throw; treat the
      // stream as closed and let the DB-side work continue silently.
      let streamClosed = false;
      const send = (event: object) => {
        if (streamClosed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          streamClosed = true;
        }
      };
      const close = () => {
        if (streamClosed) return;
        streamClosed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      // Send thread_id as first event
      send({ type: "thread_id", thread_id: thread.id });

      try {
        // 2. Fetch prior history
        const history = await getRecentThreadMessages(admin, thread.id, 20);

        // 3. Classify intent
        send(statusEvent("intent", "Reading your question"));
        const recentContent = history.slice(-5).map((m) => m.content);
        const intent = await classifyIntent(message, recentContent.length > 0 ? recentContent : undefined, aiContext);

        // 4. Save user message
        await addMessage(admin, thread.id, "user", message, channel);

        // Phase 1.7 — close any prior pending kinetiks_id.marcus_question_resonance
        // observation for this thread with outcome=1 (the user followed up).
        closeMarcusTurnObservationForThread(
          { account_id: accountId, thread_id: thread.id },
          admin,
        ).catch(() => undefined);

        // 5. Build data availability manifest
        send(statusEvent("brief", "Reviewing what I know"));
        const manifest = await buildDataAvailabilityManifest(accountId, admin);

        // 6. Load thread memories
        const memories = await loadThreadMemories(accountId, thread.id, admin);

        // Format recent messages
        const recentMessages = history
          .slice(-6)
          .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
          .join("\n");

        // 7. Pre-analysis brief (Haiku) — pre-fetch the platform tool
        // inventory so the brief includes the canonical capability list.
        const toolInventory = await buildToolInventoryForBrief({ accountId }).catch(
          () => undefined,
        );
        // D2 Slice 11 — recent undelivered Oracle insights so Sonnet can weave
        // them into the response. Engine post-processes the response text to
        // stamp delivered=true on cited insight_ids (see step 11.5).
        const insightProjections = await loadInsightsForBrief({
          admin,
          accountId,
        }).catch(() => []);
        const briefInsights = insightProjections.map((p) => ({
          insight_id: p.insight_id,
          type: p.type,
          severity: p.severity,
          source_app: p.source_app,
          summary: p.summary,
        }));

        // Phase 1.7 — kinetiks_id.insight_action_rate observation per surfaced
        // insight. The brief is the surfacing moment: insights here are
        // presented to Marcus and (via the response) to the user. A user
        // accepting an action linked to the insight closes outcome=1; the
        // archivist sweep closes outcome=0 after the action window. Note:
        // the "action accepted for insight X" close signal is not yet wired
        // through the approval pipeline; v1 emits every observation with
        // outcome=0 via the sweep, exercising the lifecycle.
        for (const bi of briefInsights) {
          recordInsightDeliveryObservation(
            {
              account_id: accountId,
              insight_id: bi.insight_id,
              insight_category: bi.type ?? "recommendation",
              severity: bi.severity ?? "low",
              urgency_hint: "this_week",
            },
            admin,
          ).catch(() => undefined);
        }

        // L1a — passive Pattern Library pre-fetch per Kinetiks Contract Addendum §1.10.
        const briefPatterns = await loadPatternsForBrief({
          admin,
          account_id: accountId,
        });
        const { brief, formatted: briefText } = await buildPreAnalysisBrief(
          message,
          manifest,
          memories,
          intent,
          recentMessages,
          haikuFor("marcus.pre_analysis"),
          toolInventory,
          briefInsights,
          briefPatterns,
        );

        // 7.5. Tool decision + invocation (D1, fan-out per B1). See
        // processMarcusMessage for the rationale; same pre-decided pattern,
        // then the brief is re-rendered with one [TOOL OBSERVATIONS] block
        // per invoked tool for Sonnet. Each invocation start emits a
        // tool_exec status ("Checking GA4...") via the hook.
        send(statusEvent("tool_decision", "Choosing data sources"));
        const { observations } = await decideAndInvokeTool({
          userMessage: message,
          intent,
          brief,
          accountId,
          agentRun: run,
          haikuCaller: haikuFor("marcus.tool_decision"),
          onToolInvokeStart: (toolName) => send(toolExecStatusEvent(toolName)),
        });

        // Phase 1.7.1 — open + close connection_value_per_source observation
        // per invoked connection-backed tool. Mirror of processMarcusMessage
        // above; brief inclusion is the deterministic outcome=1 signal. Same
        // status="ok" gate to keep non-evidence outputs (not_connected,
        // error, etc.) from inflating the usefulness rate.
        const connectionEvidenceRequestIds =
          await recordConnectionEvidenceForObservations(admin, accountId, observations);

        const augmentedBriefText =
          observations.length > 0
            ? formatBriefForSonnet(brief, toolInventory, observations)
            : briefText;

        closeConnectionEvidenceForRequestIds(
          admin,
          accountId,
          connectionEvidenceRequestIds,
        );

        // 8. Build messages with brief adjacent to question
        const systemPrompt = buildPersonaPrompt("Marcus");

        const conversationMessages: ConversationMessage[] = [
          ...history.map((m) => ({
            role: m.role === "user" ? "user" as const : "assistant" as const,
            content: m.content,
          })),
          {
            role: "user" as const,
            content: `${augmentedBriefText}\n\n[USER MESSAGE]\n${message}`,
          },
        ];

        // 9. Stream the Sonnet response
        send(statusEvent("responding", "Writing"));
        const stream = await routeStreamClaude(
          "marcus.persona_stream",
          conversationMessages,
          systemPrompt,
          {
            maxTokens: 2048,
            context: aiContext,
          },
        );

        let fullResponse = "";
        const isFirstExchange = history.length === 0 && !thread.title;

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            fullResponse += text;
            send({ type: "text", text });
          }
        }

        // Save complete response (before action footer)
        const savedMessage = await addMessage(admin, thread.id, "marcus", fullResponse, channel);

        // Phase 1.7 — record kinetiks_id.marcus_question_resonance observation.
        recordMarcusTurnObservation(
          {
            account_id: accountId,
            thread_id: thread.id,
            message_id: savedMessage.id,
            topic_hint: message,
            intent_hint: intent,
            icp_hint: "unknown",
          },
          admin,
        ).catch(() => undefined);

        // Stamp delivered=true on any Oracle insights Sonnet cited in
        // the streamed response. Parity with processMarcusMessage; an
        // insight without this stamp would resurface on the next turn.
        if (briefInsights.length > 0) {
          stampDeliveredFromResponse(
            admin,
            fullResponse,
            briefInsights.map((i) => i.insight_id),
          ).catch((err) =>
            console.error("[ENGINE/stream] insight delivery stamping failed:", err),
          );
        }

        // Post-stream: action generation (Haiku)
        const conversationSummary = recentMessages;
        const actionResult = await generateActions(message, fullResponse, manifest, conversationSummary, haikuFor("marcus.action_generate"));

        // Resolve actions promise for API route to execute
        resolveActions!(actionResult);

        // Stream action footer if there are actions
        if (actionResult.footer_text) {
          send({ type: "text", text: actionResult.footer_text });

          // Update saved message with action footer using captured ID
          const fullWithFooter = assembleResponse(fullResponse, actionResult);
          await admin
            .from("kinetiks_marcus_messages")
            .update({ content: fullWithFooter })
            .eq("id", savedMessage.id);
        }

        // Memory update (non-blocking, after response is persisted)
        extractAndPersistMemories(
          accountId,
          thread.id,
          message,
          fullResponse,
          memories,
          history.length,
          haikuFor("marcus.memory_extract"),
          admin,
        ).catch((err) => console.error("Memory extraction failed", err));

        // Log to Learning Ledger (non-blocking). See the non-streaming
        // path above: kinetiks_ledger with detail/source_app/source_operator.
        admin.from("kinetiks_ledger").insert({
          account_id: accountId,
          event_type: "marcus_turn",
          source_app: "marcus",
          source_operator: "marcus",
          target_layer: null,
          detail: {
            thread_id: thread.id,
            intent_type: intent,
            brief_evidence_count: brief.available_evidence.length,
            brief_gap_count: brief.not_available.length,
            memory_count: memories.length,
            tool_observation_count: observations.length,
            action_count: actionResult.actions.length,
            response_length: fullResponse.length,
            streaming: true,
          },
        }).then(({ error: ledgerError }) => {
          if (ledgerError) console.error("Failed to log to ledger", ledgerError);
        });

        // Auto-title if first exchange
        if (isFirstExchange) {
          autoTitleThread(admin, thread.id, aiContext).catch(() => {});
        }

        // End the run
        run.end();

        // Signal completion
        send({ type: "done" });
        close();
      } catch (err) {
        resolveActions!({ actions: [], footer_text: "" });
        run.end();
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        send({ type: "error", error: errorMsg });
        close();
      }
    },
  });

  return { stream: readableStream, threadId: thread.id, actionsPromise };
}
