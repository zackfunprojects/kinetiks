import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { captureException, USER_SAFE } from "@/lib/observability/sentry";
import { workspaceActionSchema } from "@/lib/embed/contract";
import type { Json } from "@kinetiks/supabase";

/**
 * POST /api/id/embed/workspace-actions
 *
 * The shared undo stack (spec §7.3). `record` appends a WorkspaceAction with
 * the next per-thread sequence_index; `undo` marks one undone. Account + thread
 * scoped (service-role write); the table is in the realtime publication so the
 * timeline syncs via postgres_changes. Fixture-labeled.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = workspaceActionSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid workspace action", 400);

  const intent = parsed.data;
  const accountId = auth.account_id;
  const admin = createAdminClient();

  try {
    if (intent.op === "undo") {
      const { data, error: updErr } = await admin
        .from("kinetiks_workspace_actions")
        .update({ undone: true })
        .eq("id", intent.action_id)
        .eq("account_id", accountId)
        .eq("thread_id", intent.thread_id)
        .select("id");
      if (updErr) throw updErr;
      if (!data || data.length === 0) return apiError("Action not found", 404);
      return apiSuccess({ accepted: true, op: "undo", id: intent.action_id });
    }

    // record: append with the next per-thread sequence_index (single-player —
    // no concurrent writers, §17.5; the unique index backstops a collision).
    const { data: last, error: maxErr } = await admin
      .from("kinetiks_workspace_actions")
      .select("sequence_index")
      .eq("account_id", accountId)
      .eq("thread_id", intent.thread_id)
      .order("sequence_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) throw maxErr;
    const nextIndex = (last?.sequence_index ?? -1) + 1;

    const { data, error: insErr } = await admin
      .from("kinetiks_workspace_actions")
      .insert({
        account_id: accountId,
        thread_id: intent.thread_id,
        participant: intent.participant,
        action_type: intent.action_type,
        target: intent.target,
        previous_value: (intent.previous_value ?? null) as Json,
        new_value: (intent.new_value ?? null) as Json,
        sequence_index: nextIndex,
        source_app: "kinetiks_fixtures",
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    return apiSuccess({ accepted: true, op: "record", id: data.id, sequence_index: nextIndex });
  } catch (err) {
    await captureException(err, {
      tags: { route: "/api/id/embed/workspace-actions", action: "embed.workspace_actions", stage: "persist", app: "id" },
      user: { id: accountId },
      extra: { op: intent.op, threadId: intent.thread_id },
    });
    return apiError(USER_SAFE.GENERIC_ERROR, 500);
  }
}
