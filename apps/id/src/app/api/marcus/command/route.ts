import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { askClaude } from "@kinetiks/ai";
import { findMatchingCapabilities, type ParsedCommandIntent } from "@/lib/marcus/command-router";
import { translateCommand } from "@/lib/marcus/command-translator";
import { dispatchCommands } from "@/lib/marcus/command-dispatcher";
import { aggregateResponses } from "@/lib/marcus/command-aggregator";

/**
 * POST /api/marcus/command
 * Full command pipeline: parse -> route -> translate -> dispatch -> aggregate
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

  try {
    // Step 1: Parse the command intent
    const parsedIntent = await parseCommandIntent(body.message);

    if (parsedIntent.confidence < 0.5) {
      return apiSuccess({
        type: "clarification",
        message: "I'm not sure what you'd like me to do. Could you be more specific?",
      });
    }

    // Step 2: Find matching capabilities
    const matches = await findMatchingCapabilities(auth.account_id, parsedIntent);

    if (matches.length === 0) {
      return apiSuccess({
        type: "no_match",
        message: "I don't have any connected apps that can handle that request. Check your integrations in Cortex.",
      });
    }

    // Step 3: Translate to structured commands
    const commands = await translateCommand(parsedIntent, matches, {
      account_id: auth.account_id,
      thread_id: body.thread_id ?? "",
    });

    if (commands.length === 0) {
      return apiSuccess({
        type: "translation_failed",
        message: "I understood the request but couldn't translate it into an app command. Try rephrasing.",
      });
    }

    // Step 4: Dispatch
    const responses = await dispatchCommands(commands);

    // Step 5: Aggregate
    const result = aggregateResponses(responses, body.message);

    // Log to Ledger
    const admin = createAdminClient();
    await admin.from("kinetiks_ledger").insert({
      account_id: auth.account_id,
      event_type: "command_executed",
      source_app: "marcus",
      target_layer: null,
      data: {
        message: body.message,
        intent: parsedIntent,
        commands_dispatched: commands.length,
        successes: responses.filter((r) => r.status === "success").length,
        errors: responses.filter((r) => r.status !== "success").length,
      },
      attribution: "marcus/command-router",
    });

    return apiSuccess({
      type: "command_result",
      message: result.text,
      has_errors: result.has_errors,
      approval_ids: result.approval_ids,
      data: result.data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Command processing failed";
    return apiError(message, 500);
  }
}

async function parseCommandIntent(message: string): Promise<ParsedCommandIntent> {
  try {
    const result = await askClaude(
      `Parse this command: "${message}"\n\nRespond with JSON: { "type": "query"|"action"|"config", "subject": string, "keywords": string[], "parameters": object, "confidence": number }`,
      {
        system: "You are a command parser for a GTM system. Extract the command type, subject, keywords, and any parameters. Confidence is 0-1. Respond with JSON only.",
        model: "claude-haiku-4-5-20251001",
        maxTokens: 256,
      }
    );

    const parsed = JSON.parse(result);
    return {
      type: parsed.type ?? "query",
      subject: parsed.subject ?? null,
      keywords: parsed.keywords ?? [],
      parameters: parsed.parameters ?? {},
      raw_text: message,
      confidence: parsed.confidence ?? 0.5,
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
