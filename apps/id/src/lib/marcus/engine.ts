import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarcusChannel, MarcusChatResponse } from "@kinetiks/types";
import type { ConversationMessage } from "@kinetiks/ai";
import { askClaudeMultiTurn, streamClaude } from "@kinetiks/ai";
import { buildMarcusSystemPrompt } from "@/lib/ai/prompts/marcus-core";
import { classifyIntent } from "./intent";
import { assembleContext } from "./context-assembly";
import {
  getOrCreateThread,
  addMessage,
  getRecentThreadMessages,
  autoTitleThread,
} from "./thread-manager";

/**
 * Process a Marcus conversation message through the full pipeline.
 *
 * Pipeline:
 * 1. Get or create thread (validates ownership)
 * 2. Fetch prior history (before saving new message to avoid duplication)
 * 3. Classify intent
 * 4. Save user message
 * 5. Assemble context (token-budgeted per intent)
 * 6. Build system prompt
 * 7. Build messages array from history + new user message
 * 8. Generate response
 * 9. Save Marcus response
 * 10. Auto-title thread if first exchange
 * 11. Return response
 *
 * Action extraction happens separately after response delivery (see action-extractor.ts).
 */
export async function processMarcusMessage(
  admin: SupabaseClient,
  accountId: string,
  message: string,
  threadId?: string,
  channel: MarcusChannel = "web"
): Promise<MarcusChatResponse> {
  // 1. Get or create thread (validates ownership before any reads)
  const thread = await getOrCreateThread(admin, accountId, threadId, channel);

  // 2. Fetch prior history BEFORE saving user message to avoid duplication
  const history = await getRecentThreadMessages(admin, thread.id, 20);

  // 3. Classify intent using recent history
  const recentContent = history.slice(-5).map((m) => m.content);
  const intent = await classifyIntent(message, recentContent.length > 0 ? recentContent : undefined);

  // 4. Save user message (after history fetch to prevent it appearing in history)
  await addMessage(admin, thread.id, "user", message, channel);

  // 5. Assemble context
  const contextSummary = await assembleContext(
    admin,
    accountId,
    intent,
    thread.id,
    message
  );

  // 6. Build system prompt
  const systemPrompt = buildMarcusSystemPrompt({ contextSummary });

  // 7. Build messages array: prior history + new user message
  const conversationMessages: ConversationMessage[] = [
    ...history.map((m) => ({
      role: m.role === "user" ? "user" as const : "assistant" as const,
      content: m.content,
    })),
    { role: "user" as const, content: message },
  ];

  // 8. Generate response
  const responseText = await askClaudeMultiTurn(conversationMessages, {
    system: systemPrompt,
    model: "claude-sonnet-4-20250514",
    maxTokens: 2048,
  });

  // 9. Save Marcus response
  await addMessage(admin, thread.id, "marcus", responseText, channel);

  // 10. Auto-title if this is the first exchange (no prior history)
  if (history.length === 0 && !thread.title) {
    autoTitleThread(admin, thread.id).catch(() => {
      // Non-critical - don't block response
    });
  }

  // 11. Return
  return {
    thread_id: thread.id,
    message: responseText,
  };
}

/**
 * Stream a Marcus conversation message.
 * Returns a ReadableStream that emits SSE-formatted text deltas.
 *
 * After the stream completes, the caller should trigger action extraction.
 */
export async function streamMarcusMessage(
  admin: SupabaseClient,
  accountId: string,
  message: string,
  threadId?: string,
  channel: MarcusChannel = "web"
): Promise<{ stream: ReadableStream; threadId: string }> {
  // 1. Get or create thread (validates ownership before any reads)
  const thread = await getOrCreateThread(admin, accountId, threadId, channel);

  // 2. Fetch prior history BEFORE saving user message to avoid duplication
  const history = await getRecentThreadMessages(admin, thread.id, 20);

  // 3. Classify intent using recent history
  const recentContent = history.slice(-5).map((m) => m.content);
  const intent = await classifyIntent(message, recentContent.length > 0 ? recentContent : undefined);

  // 4. Save user message (after history fetch)
  await addMessage(admin, thread.id, "user", message, channel);

  // 5. Assemble context
  const contextSummary = await assembleContext(
    admin,
    accountId,
    intent,
    thread.id,
    message
  );

  // 6. Build system prompt
  const systemPrompt = buildMarcusSystemPrompt({ contextSummary });

  // 7. Build messages array: prior history + new user message
  const conversationMessages: ConversationMessage[] = [
    ...history.map((m) => ({
      role: m.role === "user" ? "user" as const : "assistant" as const,
      content: m.content,
    })),
    { role: "user" as const, content: message },
  ];

  // 8. Create streaming response
  const claudeStream = streamClaude(conversationMessages, {
    system: systemPrompt,
    model: "claude-sonnet-4-20250514",
    maxTokens: 2048,
  });

  let fullResponse = "";
  const isFirstExchange = history.length === 0 && !thread.title;

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

        // Save complete response
        await addMessage(admin, thread.id, "marcus", fullResponse, channel);

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
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return { stream: readableStream, threadId: thread.id };
}
