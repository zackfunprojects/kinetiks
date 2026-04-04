import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarcusChannel, MarcusChatResponse } from "@kinetiks/types";
import type { ConversationMessage } from "@kinetiks/ai";
import { askClaudeMultiTurn, askClaude, streamClaude } from "@kinetiks/ai";
import { buildMarcusSystemPrompt } from "@/lib/ai/prompts/marcus-core";
import { buildMarcusSystemPromptV2 } from "./prompts/marcus-system";
import { MAX_RESPONSE_SENTENCES } from "./prompts/marcus-system";
import { classifyIntent } from "./intent";
import { assembleContext, buildDataAvailabilityManifest } from "./context-assembly";
import {
  getOrCreateThread,
  addMessage,
  getRecentThreadMessages,
  autoTitleThread,
} from "./thread-manager";
import { validateResponse } from "./validators/response-validator";
import {
  buildRewritePrompt,
  buildFallbackResponse,
} from "./prompts/marcus-validation";
import type { DataAvailabilityManifest } from "./types";

/**
 * Process a Marcus conversation message through the full pipeline.
 *
 * Pipeline:
 * 1. Get or create thread (validates ownership)
 * 2. Fetch prior history (before saving new message to avoid duplication)
 * 3. Classify intent
 * 4. Save user message
 * 5. Assemble context (token-budgeted per intent)
 * 5b. Build data availability manifest
 * 6. Build system prompt (v2 with manifest + hard constraints)
 * 7. Build messages array from history + new user message
 * 8. Generate response
 * 8b. Validate response - rewrite if violations detected
 * 9. Save Marcus response
 * 9b. Log validation results to Learning Ledger
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
): Promise<MarcusChatResponse & { _validation?: ValidationMetadata; manifest?: DataAvailabilityManifest }> {
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

  // 5b. Build data availability manifest
  const manifest = await buildDataAvailabilityManifest(accountId, admin);

  // 6. Build system prompt (v2 with manifest, evidence rules, anti-sycophancy)
  // Fall back to v1 prompt with context summary appended
  const systemName = "Marcus"; // Could be customized per account in the future
  const systemPrompt = buildMarcusSystemPromptV2(
    systemName,
    manifest,
    [], // activeGoals - TODO: load from account settings
    null // productStack - already in context summary
  ) + `\n\n---\n\n## Assembled Context\n\n${contextSummary}`;

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

  // 8b. Validate response before delivery
  const validation = validateResponse(responseText, manifest, intent, message);

  let finalResponse = responseText;

  if (validation.needs_rewrite && validation.rewrite_instructions) {
    // Request a rewrite from Haiku
    const rewritePrompt = buildRewritePrompt(
      responseText,
      validation.rewrite_instructions,
      intent,
      MAX_RESPONSE_SENTENCES[intent] ?? 8
    );

    try {
      const rewrittenText = await askClaude(rewritePrompt, {
        model: "claude-haiku-4-5-20251001",
        maxTokens: 1024,
      });

      // Validate the rewrite
      const revalidation = validateResponse(rewrittenText, manifest, intent, message);

      if (
        revalidation.passed ||
        revalidation.evidence.violations.filter((v) => v.severity === "hard").length === 0
      ) {
        finalResponse = rewrittenText;
      } else {
        // Rewrite also failed - use fallback
        console.warn("Marcus rewrite also failed validation", {
          original_violations: validation.evidence.violations,
          rewrite_violations: revalidation.evidence.violations,
        });
        finalResponse = buildFallbackResponse(
          intent,
          manifest.known_gaps.map((g) => g.what_is_missing)
        );
      }
    } catch (error) {
      console.error("Marcus rewrite failed", error);
      // Keep original response if rewrite call fails - better than nothing
      finalResponse = responseText;
    }
  }

  // 9. Save Marcus response
  await addMessage(admin, thread.id, "marcus", finalResponse, channel);

  // 9b. Log validation results to Learning Ledger (non-blocking, fire-and-forget)
  admin.from("kinetiks_learning_ledger").insert({
    account_id: accountId,
    event_type: "marcus_response_validation",
    source: "marcus",
    data: {
      thread_id: thread.id,
      intent_type: intent,
      validation_passed: validation.passed,
      was_rewritten: finalResponse !== responseText,
      violation_count: validation.evidence.violations.length,
      violation_types: validation.evidence.violations.map((v) => v.type),
      sentence_count: validation.verbosity.sentence_count,
      max_allowed: validation.verbosity.max_allowed,
      manifest_summary: {
        cortex_confidence: manifest.cortex_coverage.overall_confidence,
        connected_apps: manifest.connections
          .filter((c) => c.connected)
          .map((c) => c.app_name),
        disconnected_apps: manifest.connections
          .filter((c) => !c.connected)
          .map((c) => c.app_name),
        gap_count: manifest.known_gaps.length,
      },
    },
  }).then(({ error }) => {
    if (error) console.error("Failed to log validation to ledger", error);
  });

  // 10. Auto-title if this is the first exchange (no prior history)
  if (history.length === 0 && !thread.title) {
    autoTitleThread(admin, thread.id).catch(() => {
      // Non-critical - don't block response
    });
  }

  // 11. Return
  return {
    thread_id: thread.id,
    message: finalResponse,
    manifest,
    _validation: {
      original_passed: validation.passed,
      was_rewritten: finalResponse !== responseText,
      violations_caught: validation.evidence.violations.length,
      sentence_count: validation.verbosity.sentence_count,
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
 * Stream a Marcus conversation message.
 * Returns a ReadableStream that emits SSE-formatted text deltas.
 *
 * Note: Streaming bypasses the validation loop since we can't rewrite
 * mid-stream. The validation runs post-stream and logs results for
 * quality monitoring. Future improvement: buffer the full response
 * before streaming to enable validation.
 *
 * After the stream completes, the caller should trigger action extraction.
 */
export async function streamMarcusMessage(
  admin: SupabaseClient,
  accountId: string,
  message: string,
  threadId?: string,
  channel: MarcusChannel = "web"
): Promise<{ stream: ReadableStream; threadId: string; manifest: DataAvailabilityManifest }> {
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

  // 5b. Build data availability manifest
  const manifest = await buildDataAvailabilityManifest(accountId, admin);

  // 6. Build system prompt (v2 with manifest + hard constraints)
  const systemName = "Marcus";
  const systemPrompt = buildMarcusSystemPromptV2(
    systemName,
    manifest,
    [],
    null
  ) + `\n\n---\n\n## Assembled Context\n\n${contextSummary}`;

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

        // Post-stream validation logging (non-blocking, fire-and-forget)
        const validation = validateResponse(fullResponse, manifest, intent, message);
        admin.from("kinetiks_learning_ledger").insert({
          account_id: accountId,
          event_type: "marcus_response_validation",
          source: "marcus",
          data: {
            thread_id: thread.id,
            intent_type: intent,
            validation_passed: validation.passed,
            was_rewritten: false, // Streaming can't rewrite
            violation_count: validation.evidence.violations.length,
            violation_types: validation.evidence.violations.map((v) => v.type),
            sentence_count: validation.verbosity.sentence_count,
            max_allowed: validation.verbosity.max_allowed,
            streaming: true,
            manifest_summary: {
              cortex_confidence: manifest.cortex_coverage.overall_confidence,
              connected_apps: manifest.connections
                .filter((c) => c.connected)
                .map((c) => c.app_name),
              disconnected_apps: manifest.connections
                .filter((c) => !c.connected)
                .map((c) => c.app_name),
              gap_count: manifest.known_gaps.length,
            },
          },
        }).then(({ error: ledgerError }) => {
          if (ledgerError) console.error("Failed to log validation to ledger", ledgerError);
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
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return { stream: readableStream, threadId: thread.id, manifest };
}
