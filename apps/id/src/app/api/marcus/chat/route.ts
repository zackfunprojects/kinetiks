import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { streamMarcusMessage } from "@/lib/marcus/engine";
import { extractActions, executeActions } from "@/lib/marcus/action-extractor";
import { assembleContext } from "@/lib/marcus/context-assembly";
import { getThreadMessages } from "@/lib/marcus/thread-manager";
import type { MarcusChannel } from "@kinetiks/types";
import { NextResponse } from "next/server";

/**
 * POST /api/marcus/chat
 *
 * Primary Marcus conversation endpoint. Streams SSE responses.
 *
 * Body: { message: string, thread_id?: string, channel?: MarcusChannel }
 *
 * SSE events:
 * - { type: "thread_id", thread_id: string } - sent first for new threads
 * - { type: "text", text: string } - streaming text deltas
 * - { type: "done" } - response complete
 * - { type: "extraction", disclosure: string, actions: ExtractedAction[] } - post-response
 * - { type: "error", error: string } - on failure
 */
export async function POST(request: Request) {
  // Auth - user only (no service auth for chat)
  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { message, thread_id, channel } = body as {
    message?: string;
    thread_id?: string;
    channel?: MarcusChannel;
  };

  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json(
      { error: "Message is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Resolve account
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  try {
    // Stream the Marcus response
    const { stream, threadId } = await streamMarcusMessage(
      admin,
      account.id,
      message.trim(),
      thread_id,
      channel ?? "web"
    );

    // Wrap the stream to append extraction after completion
    const encoder = new TextEncoder();
    let streamDone = false;

    const wrappedStream = new ReadableStream({
      async start(controller) {
        const reader = stream.getReader();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              streamDone = true;
              break;
            }
            controller.enqueue(value);
          }

          // After stream completes, run extraction
          try {
            const messages = await getThreadMessages(admin, threadId, 4);
            const userMsg = [...messages]
              .reverse()
              .find((m) => m.role === "user");
            const marcusMsg = [...messages]
              .reverse()
              .find((m) => m.role === "marcus");

            if (userMsg && marcusMsg) {
              const contextSummary = await assembleContext(
                admin,
                account.id,
                "implicit_intel",
                threadId
              );

              const actions = await extractActions(
                userMsg.content,
                marcusMsg.content,
                contextSummary
              );

              if (actions.length > 0) {
                const disclosure = await executeActions(
                  admin,
                  account.id,
                  actions,
                  threadId
                );

                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "extraction", disclosure, actions })}\n\n`
                  )
                );
              }
            }
          } catch {
            // Extraction failure is non-critical
          }

          controller.close();
        } catch (err) {
          if (!streamDone) {
            const errorMsg =
              err instanceof Error ? err.message : "Stream error";
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`
              )
            );
          }
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
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
