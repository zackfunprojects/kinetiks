/**
 * POST /api/marcus/threads/from-insight
 *
 * The "Apply" button on an InsightCard target. Creates a new Marcus
 * thread pre-seeded with the insight summary + suggested action, then
 * returns the thread id so the client can redirect to /chat/<thread_id>.
 *
 * Writes a Learning Ledger entry `insight_applied`.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/utils/api-response";

const Body = z.object({
  insight_id: z.string().uuid(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return apiError(
      `Invalid body: ${err instanceof Error ? err.message : "unknown"}`,
      400
    );
  }

  const admin = createAdminClient();

  // 1. Load the insight + verify ownership
  const { data: insight, error: insightErr } = await admin
    .from("kinetiks_insights")
    .select(
      "id, type, severity, source_app, summary, evidence, suggested_action"
    )
    .eq("id", body.insight_id)
    .eq("account_id", auth.account_id)
    .maybeSingle();

  if (insightErr) return apiError(`Failed to load insight: ${insightErr.message}`, 500);
  if (!insight) return apiError("Insight not found", 404);

  // 2. Build the seed message for Marcus
  const suggested = (insight.suggested_action as { label?: string } | null) ?? null;
  const seedMessage = [
    `I want to act on this Oracle insight:`,
    ``,
    `> ${insight.summary}`,
    ``,
    `Source: ${insight.source_app}.   Severity: ${insight.severity}.   Type: ${insight.type}.`,
    suggested && suggested.label
      ? `Suggested action: ${suggested.label}`
      : `Help me decide what to do next.`,
    ``,
    `[insight_id=${insight.id}]`,
  ].join("\n");

  // 3. Create the thread + first message
  const { data: thread, error: threadErr } = await admin
    .from("kinetiks_marcus_threads")
    .insert({
      account_id: auth.account_id,
      title: `Acting on: ${insight.summary.slice(0, 80)}`,
      channel: "chat",
    })
    .select("id")
    .single();

  if (threadErr || !thread) {
    return apiError(`Failed to create thread: ${threadErr?.message ?? "unknown"}`, 500);
  }

  const { error: msgErr } = await admin.from("kinetiks_marcus_messages").insert({
    thread_id: thread.id,
    account_id: auth.account_id,
    role: "user",
    content: seedMessage,
    channel: "chat",
  });

  if (msgErr) {
    return apiError(`Failed to seed thread: ${msgErr.message}`, 500);
  }

  // 4. Ledger entry (fire-and-forget). kinetiks_ledger with the real
  // detail/source_app/source_operator columns; the prior table and
  // source/data keys did not exist.
  void admin
    .from("kinetiks_ledger")
    .insert({
      account_id: auth.account_id,
      event_type: "insight_applied",
      source_app: "oracle",
      source_operator: "oracle",
      target_layer: null,
      detail: {
        insight_id: insight.id,
        thread_id: thread.id,
        source_app: insight.source_app,
        severity: insight.severity,
        type: insight.type,
      },
    });

  return NextResponse.json({ ok: true, thread_id: thread.id });
}
