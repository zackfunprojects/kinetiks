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
import { loadInsightsForBrief } from "@/lib/oracle/insights/reader";
import { loadPatternsForBrief } from "./patterns-for-brief";
import { stampDeliveredFromResponse } from "@/lib/oracle/insights/delivery";
import {
  closeMarcusTurnObservationForThread,
  recordInsightDeliveryObservation,
  recordMarcusTurnObservation,
} from "@/lib/patterns/emit-internal";
import { buildPersonaPrompt } from "./prompts/marcus-persona";
import { generateActions } from "./action-generator";
import { assembleResponse } from "./response-assembler";
import { decideAndInvokeTool } from "./tool-decision";
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
  console.log("[ENGINE] accountId passed to manifest:", accountId);
  const manifest = await buildDataAvailabilityManifest(accountId, admin);
  console.log("[ENGINE] manifest overall confidence:", manifest.cortex_coverage.overall_confidence);
  console.log("[ENGINE] manifest layers with data:", manifest.cortex_coverage.layers.filter((l) => l.has_data).map((l) => `${l.layer_name}: ${l.confidence}%`));

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
  console.log("[ENGINE] brief evidence count:", brief.available_evidence.length);
  console.log("[ENGINE] brief must_not:", brief.response_shape.must_not);

  // 7.5. Tool decision + invocation (D1). A Haiku picks whether any
  // single registered tool would directly answer the question; if yes,
  // the Runtime invokes it and we re-render the brief with a
  // [TOOL OBSERVATIONS] section adjacent to the user's question.
  const { observation } = await decideAndInvokeTool({
    userMessage: message,
    intent,
    brief,
    accountId,
    agentRun: run,
    haikuCaller: haikuFor("marcus.tool_decision"),
  });
  const augmentedBriefText = observation
    ? formatBriefForSonnet(brief, toolInventory, observation)
    : briefText;

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

  // 13. Log to Learning Ledger (non-blocking)
  admin.from("kinetiks_learning_ledger").insert({
    account_id: accountId,
    event_type: "marcus_response_v2",
    source: "marcus",
    data: {
      thread_id: thread.id,
      intent_type: intent,
      brief_evidence_count: brief.available_evidence.length,
      brief_gap_count: brief.not_available.length,
      memory_count: memories.length,
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
 * Returns a ReadableStream that emits SSE-formatted text deltas.
 *
 * V2 streaming pipeline:
 * - Pre-stream: intent, manifest, memory, pre-analysis brief
 * - Stream: Sonnet with persona prompt + brief adjacent to question
 * - Post-stream: action generation + memory update (parallel)
 * - Stream action footer after response completes
 */
export async function streamMarcusMessage(
  admin: SupabaseClient,
  accountId: string,
  message: string,
  threadId?: string,
  channel: MarcusChannel = "web"
): Promise<{ stream: ReadableStream; threadId: string; manifest: DataAvailabilityManifest; actionsPromise?: Promise<ActionGenerationResult> }> {
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

  // 2. Fetch prior history
  const history = await getRecentThreadMessages(admin, thread.id, 20);

  // 3. Classify intent
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

  // 7.5. Tool decision + invocation (D1). See processMarcusMessage for
  // the rationale; same pre-decided pattern, then the brief is
  // re-rendered with a [TOOL OBSERVATIONS] section for Sonnet.
  const { observation } = await decideAndInvokeTool({
    userMessage: message,
    intent,
    brief,
    accountId,
    agentRun: run,
    haikuCaller: haikuFor("marcus.tool_decision"),
  });
  const augmentedBriefText = observation
    ? formatBriefForSonnet(brief, toolInventory, observation)
    : briefText;

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

  // 9. Create streaming response
  const claudeStream = routeStreamClaude(
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

  // Promise that resolves with action generation result (for API route to execute)
  let resolveActions: (value: ActionGenerationResult) => void;
  const actionsPromise = new Promise<ActionGenerationResult>((resolve) => {
    resolveActions = resolve;
  });

  const readableStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send thread_id as first event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "thread_id", thread_id: thread.id })}\n\n`)
      );

      try {
        const stream = await claudeStream;
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            fullResponse += text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "text", text })}\n\n`)
            );
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
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "text", text: actionResult.footer_text })}\n\n`)
          );

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

        // Log to Learning Ledger (non-blocking)
        admin.from("kinetiks_learning_ledger").insert({
          account_id: accountId,
          event_type: "marcus_response_v2",
          source: "marcus",
          data: {
            thread_id: thread.id,
            intent_type: intent,
            brief_evidence_count: brief.available_evidence.length,
            brief_gap_count: brief.not_available.length,
            memory_count: memories.length,
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
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
        );
        controller.close();
      } catch (err) {
        resolveActions!({ actions: [], footer_text: "" });
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return { stream: readableStream, threadId: thread.id, manifest, actionsPromise };
}
