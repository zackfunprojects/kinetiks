import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarcusChannel, MarcusChatResponse } from "@kinetiks/types";
import type { ConversationMessage } from "@kinetiks/ai";
import { askClaudeMultiTurn, askClaude, streamClaude } from "@kinetiks/ai";
import { classifyIntent } from "./intent";
import { assembleContext, buildDataAvailabilityManifest } from "./context-assembly";
import {
  getOrCreateThread,
  addMessage,
  getRecentThreadMessages,
  autoTitleThread,
} from "./thread-manager";
import { loadThreadMemories, extractAndPersistMemories } from "./memory";
import { buildPreAnalysisBrief } from "./pre-analysis";
import { buildPersonaPrompt } from "./prompts/marcus-persona";
import { generateActions } from "./action-generator";
import { assembleResponse } from "./response-assembler";
import type { DataAvailabilityManifest, ActionGenerationResult } from "./types";

/**
 * Wrap askClaude for Haiku calls so it returns the format our modules expect:
 * { content: [{ text: string }] }
 */
function makeHaikuCaller() {
  return async (prompt: string) => {
    const text = await askClaude(prompt, {
      model: "claude-haiku-4-5-20251001",
      maxTokens: 1024,
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
  const claudeHaiku = makeHaikuCaller();

  // 1. Get or create thread (validates ownership before any reads)
  const thread = await getOrCreateThread(admin, accountId, threadId, channel);

  // 2. Fetch prior history BEFORE saving user message to avoid duplication
  const history = await getRecentThreadMessages(admin, thread.id, 20);

  // 3. Classify intent using recent history
  const recentContent = history.slice(-5).map((m) => m.content);
  const intent = await classifyIntent(message, recentContent.length > 0 ? recentContent : undefined);

  // 4. Save user message (after history fetch to prevent it appearing in history)
  await addMessage(admin, thread.id, "user", message, channel);

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

  // 7. Pre-analysis brief (Haiku)
  const { brief, formatted: briefText } = await buildPreAnalysisBrief(
    message,
    manifest,
    memories,
    intent,
    recentMessages,
    claudeHaiku,
  );
  console.log("[ENGINE] brief evidence count:", brief.available_evidence.length);
  console.log("[ENGINE] brief must_not:", brief.response_shape.must_not);

  // 8. Response generation (Sonnet) - short persona prompt + brief adjacent to question
  const systemPrompt = buildPersonaPrompt("Marcus");

  const conversationMessages: ConversationMessage[] = [
    ...history.map((m) => ({
      role: m.role === "user" ? "user" as const : "assistant" as const,
      content: m.content,
    })),
    {
      role: "user" as const,
      content: `${briefText}\n\n[USER MESSAGE]\n${message}`,
    },
  ];

  const responseText = await askClaudeMultiTurn(conversationMessages, {
    system: systemPrompt,
    model: "claude-sonnet-4-20250514",
    maxTokens: 2048,
  });

  // 9. Action generation (Haiku) - runs before memory update so we can assemble and save first
  const conversationSummary = recentMessages;
  const actionResult = await generateActions(message, responseText, manifest, conversationSummary, claudeHaiku);

  // 10. Assemble response + action footer
  const finalResponse = assembleResponse(responseText, actionResult);

  // 11. Save Marcus response BEFORE mutating thread memory
  await addMessage(admin, thread.id, "marcus", finalResponse, channel);

  // 12. Memory update (Haiku) - non-blocking, after response is persisted
  extractAndPersistMemories(
    accountId,
    thread.id,
    message,
    responseText,
    memories,
    history.length,
    claudeHaiku,
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
    autoTitleThread(admin, thread.id).catch(() => {});
  }

  // 14. Return
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
  const claudeHaiku = makeHaikuCaller();

  // 1. Get or create thread
  const thread = await getOrCreateThread(admin, accountId, threadId, channel);

  // 2. Fetch prior history
  const history = await getRecentThreadMessages(admin, thread.id, 20);

  // 3. Classify intent
  const recentContent = history.slice(-5).map((m) => m.content);
  const intent = await classifyIntent(message, recentContent.length > 0 ? recentContent : undefined);

  // 4. Save user message
  await addMessage(admin, thread.id, "user", message, channel);

  // 5. Build data availability manifest
  const manifest = await buildDataAvailabilityManifest(accountId, admin);

  // 6. Load thread memories
  const memories = await loadThreadMemories(accountId, thread.id, admin);

  // Format recent messages
  const recentMessages = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
    .join("\n");

  // 7. Pre-analysis brief (Haiku)
  const { brief, formatted: briefText } = await buildPreAnalysisBrief(
    message,
    manifest,
    memories,
    intent,
    recentMessages,
    claudeHaiku,
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
      content: `${briefText}\n\n[USER MESSAGE]\n${message}`,
    },
  ];

  // 9. Create streaming response
  const claudeStream = streamClaude(conversationMessages, {
    system: systemPrompt,
    model: "claude-sonnet-4-20250514",
    maxTokens: 2048,
  });

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

        // Post-stream: action generation (Haiku)
        const conversationSummary = recentMessages;
        const actionResult = await generateActions(message, fullResponse, manifest, conversationSummary, claudeHaiku);

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
          claudeHaiku,
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
          autoTitleThread(admin, thread.id).catch(() => {});
        }

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
