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
  getThreadMessages,
  autoTitleThread,
} from "./thread-manager";

/**
 * Process a Marcus conversation message through the full pipeline.
 *
 * Pipeline:
 * 1. Get or create thread (validates ownership)
 * 2. Classify intent
 * 3. Save user message
 * 4. Assemble context (token-budgeted per intent)
 * 5. Build system prompt
 * 6. Build messages array from thread history
 * 7. Generate response
 * 8. Save Marcus response
 * 9. Auto-title thread if first exchange
 * 10. Return response
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

  // 2. Classify intent using validated thread history
  const recentMessages = threadId
    ? (await getThreadMessages(admin, thread.id, 5)).map((m) => m.content)
    : undefined;
  const intent = await classifyIntent(message, recentMessages);

  // 3. Save user message
  await addMessage(admin, thread.id, "user", message, channel);

  // 4. Assemble context
  const contextSummary = await assembleContext(
    admin,
    accountId,
    intent,
    thread.id
  );

  // 5. Build system prompt
  const systemPrompt = buildMarcusSystemPrompt({ contextSummary });

  // 6. Build messages array from thread history
  const history = await getThreadMessages(admin, thread.id, 20);
  const conversationMessages: ConversationMessage[] = history.map((m) => ({
    role: m.role === "user" ? "user" as const : "assistant" as const,
    content: m.content,
  }));

  // 7. Generate response
  const responseText = await askClaudeMultiTurn(conversationMessages, {
    system: systemPrompt,
    model: "claude-sonnet-4-20250514",
    maxTokens: 2048,
  });

  // 8. Save Marcus response
  await addMessage(admin, thread.id, "marcus", responseText, channel);

  // 9. Auto-title if this is the first exchange (2 messages: user + marcus)
  if (history.length <= 2 && !thread.title) {
    autoTitleThread(admin, thread.id).catch(() => {
      // Non-critical - don't block response
    });
  }

  // 10. Return
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

  // 2. Classify intent using validated thread history
  const recentMessages = threadId
    ? (await getThreadMessages(admin, thread.id, 5)).map((m) => m.content)
    : undefined;
  const intent = await classifyIntent(message, recentMessages);

  // 3. Save user message
  await addMessage(admin, thread.id, "user", message, channel);

  // 4. Assemble context
  const contextSummary = await assembleContext(
    admin,
    accountId,
    intent,
    thread.id
  );

  // 5. Build system prompt
  const systemPrompt = buildMarcusSystemPrompt({ contextSummary });

  // 6. Build messages array from thread history
  const history = await getThreadMessages(admin, thread.id, 20);
  const conversationMessages: ConversationMessage[] = history.map((m) => ({
    role: m.role === "user" ? "user" as const : "assistant" as const,
    content: m.content,
  }));

  // 7. Create streaming response
  const claudeStream = streamClaude(conversationMessages, {
    system: systemPrompt,
    model: "claude-sonnet-4-20250514",
    maxTokens: 2048,
  });

  let fullResponse = "";

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
        if (history.length <= 1 && !thread.title) {
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
