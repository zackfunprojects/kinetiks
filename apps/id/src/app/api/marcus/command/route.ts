import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/utils/api-response";
import { askClaude } from "@kinetiks/ai";
import { findMatchingCapabilities, type ParsedCommandIntent } from "@/lib/marcus/command-router";
import { translateCommand } from "@/lib/marcus/command-translator";
import { dispatchCommands } from "@/lib/marcus/command-dispatcher";
import { aggregateResponses } from "@/lib/marcus/command-aggregator";
import {
  encodeCommandEvent,
  type CommandStreamEvent,
} from "@/lib/marcus/command-stream";

/**
 * POST /api/marcus/command
 *
 * Full command pipeline (parse -> route -> translate -> dispatch -> aggregate),
 * streamed as SSE so the Chat UI can render live progress and mount the
 * collaborative app panel as soon as the work produces a viewable entity.
 *
 * Body: { message: string, thread_id?: string }
 *
 * SSE events (see CommandStreamEvent):
 * - command_progress  per-command dispatch progress (spec §7)
 * - panel_open        mount the app panel (spec §4.2); emitted before the result
 * - command_result    final aggregated response (text, approvals, data, panel)
 * - clarification | no_match | translation_failed  early exits
 * - error             on failure
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: { message: string; thread_id?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.message) {
    return apiError("Message is required", 400);
  }

  const accountId = auth.account_id;
  const threadId = body.thread_id ?? "";
  const message = body.message;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: CommandStreamEvent) =>
        controller.enqueue(encoder.encode(encodeCommandEvent(event)));

      try {
        // Step 1: Parse the command intent
        const parsedIntent = await parseCommandIntent(message);
        if (parsedIntent.confidence < 0.5) {
          send({
            type: "clarification",
            message:
              "I'm not sure what you'd like me to do. Could you be more specific?",
          });
          controller.close();
          return;
        }

        // Step 2: Find matching capabilities
        const matches = await findMatchingCapabilities(accountId, parsedIntent);
        if (matches.length === 0) {
          send({
            type: "no_match",
            message:
              "I don't have any connected apps that can handle that request. Check your integrations in Cortex.",
          });
          controller.close();
          return;
        }

        // Step 3: Translate to structured commands
        const commands = await translateCommand(parsedIntent, matches, {
          account_id: accountId,
          thread_id: threadId,
        });
        if (commands.length === 0) {
          send({
            type: "translation_failed",
            message:
              "I understood the request but couldn't translate it into an app command. Try rephrasing.",
          });
          controller.close();
          return;
        }

        // Step 4: Dispatch (sequential where dependencies exist), streaming progress
        const responses = await dispatchCommands(commands, {
          onProgress: (progress) => send({ type: "command_progress", progress }),
        });

        // Step 5: Aggregate
        const result = aggregateResponses(responses, message);

        // Log to Ledger
        const admin = createAdminClient();
        const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
          account_id: accountId,
          event_type: "command_executed",
          source_app: "marcus",
          source_operator: "command-router",
          target_layer: null,
          detail: {
            message,
            intent: parsedIntent,
            commands_dispatched: commands.length,
            successes: responses.filter((r) => r.status === "success").length,
            errors: responses.filter((r) => r.status !== "success").length,
          },
        });
        if (ledgerError) {
          console.error("Failed to write command ledger entry:", ledgerError.message);
        }

        // Mount the panel first (so it can preload while the result renders)
        if (result.app_panel_open) {
          send({ type: "panel_open", panel: result.app_panel_open });
        }

        send({
          type: "command_result",
          text: result.text,
          has_errors: result.has_errors,
          approval_ids: result.approval_ids,
          data: result.data,
          app_panel_open: result.app_panel_open,
        });
        controller.close();
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Command processing failed";
        send({ type: "error", error: errorMsg });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function parseCommandIntent(message: string): Promise<ParsedCommandIntent> {
  try {
    const result = await askClaude(
      `Parse this command: "${message}"\n\nRespond with JSON: { "type": "query"|"action"|"config", "subject": string, "keywords": string[], "parameters": object, "confidence": number }`,
      {
        system: "You are a command parser for a GTM system. Extract the command type, subject, keywords, and any parameters. Confidence is 0-1. Respond with JSON only.",
        role: "fast",
        maxTokens: 256,
      }
    );

    const parsed = JSON.parse(result);
    const validTypes = ["query", "action", "config"];
    return {
      type: validTypes.includes(parsed.type) ? parsed.type : "query",
      subject: typeof parsed.subject === "string" ? parsed.subject : null,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter((k: unknown) => typeof k === "string") : [],
      parameters: typeof parsed.parameters === "object" && parsed.parameters !== null ? parsed.parameters : {},
      raw_text: message,
      confidence: typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1 ? parsed.confidence : 0.5,
    };
  } catch {
    return {
      type: "query",
      subject: null,
      keywords: message.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
      parameters: {},
      raw_text: message,
      confidence: 0.3,
    };
  }
}
