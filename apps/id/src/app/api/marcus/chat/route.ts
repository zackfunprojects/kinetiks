import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { streamMarcusMessage } from "@/lib/marcus/engine";
import { executeActions } from "@/lib/marcus/action-extractor";
import { assembleContext } from "@/lib/marcus/context-assembly";
import { getThreadMessages } from "@/lib/marcus/thread-manager";
import type { MarcusChannel } from "@kinetiks/types";
import { apiError } from "@/lib/utils/api-response";

/**
 * POST /api/marcus/chat
 *
 * Primary Marcus conversation endpoint. Streams SSE responses.
 *
 * V2 pipeline: pre-analysis brief -> Sonnet (persona only) -> action generation + memory (parallel)
 *
 * Body: { message: string, thread_id?: string, channel?: MarcusChannel }
 *
 * SSE events:
 * - { type: "thread_id", thread_id: string } - sent first for new threads
 * - { type: "text", text: string } - streaming text deltas (includes action footer)
 * - { type: "done" } - response complete
 * - { type: "extraction", disclosure: string, actions: GeneratedAction[] } - post-response action execution
 * - { type: "error", error: string } - on failure
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const { message, thread_id, channel } = body as {
    message?: string;
    thread_id?: string;
    channel?: MarcusChannel;
  };

  if (typeof message !== "string" || !message.trim()) {
    return apiError("Message is required", 400);
  }

  const admin = createAdminClient();
  const accountId = auth.account_id;

  try {
    // Stream the Marcus response (v2 pipeline handles pre-analysis, generation, actions, memory)
    const { stream, threadId, manifest, actionsPromise } = await streamMarcusMessage(
      admin,
      accountId,
      message.trim(),
      thread_id,
      channel ?? "web"
    );

    // Wrap the stream to append action execution results after completion
    const encoder = new TextEncoder();

    const wrappedStream = new ReadableStream({
      async start(controller) {
        const reader = stream.getReader();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }

          // After stream completes, execute generated actions (persist to DB)
          // The engine already streams the action footer as text events.
          // We only execute actions here (persist proposals/briefs/follow-ups) - no duplicate disclosure.
          try {
            const actionResult = await actionsPromise;
            if (actionResult && actionResult.actions.length > 0) {
              // Convert GeneratedAction[] to ExtractedAction[] format for executeActions
              const extractedActions = actionResult.actions
                .filter((a) => a.type !== "connection_needed")
                .map((a) => {
                  if (a.type === "proposal") {
                    return {
                      type: "proposal" as const,
                      target_layer: a.payload.target_layer ?? "org",
                      action: a.payload.action ?? "add",
                      confidence: a.payload.confidence ?? "inferred",
                      payload: a.payload,
                      evidence_summary: a.description,
                    };
                  }
                  if (a.type === "brief" && a.target_app) {
                    return {
                      type: "brief" as const,
                      target_app: a.target_app,
                      content: a.description,
                    };
                  }
                  if (a.type === "follow_up") {
                    return {
                      type: "follow_up" as const,
                      message: a.description,
                      delay_hours: a.payload.delay_hours ?? 24,
                    };
                  }
                  return null;
                })
                .filter(Boolean) as any[];

              if (extractedActions.length > 0) {
                // Execute actions in DB (persist proposals, briefs, follow-ups)
                // Don't send disclosure - engine already streamed the action footer
                await executeActions(
                  admin,
                  accountId,
                  extractedActions,
                  threadId
                );
              }
            }
          } catch {
            // Extraction failure is non-critical
          }

          controller.close();
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : "Stream error";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(wrappedStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Thread-Id": threadId,
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Marcus chat error:", errMsg, err instanceof Error ? err.stack : "");
    return apiError(`Marcus pipeline failed: ${errMsg}`, 500);
  }
}
