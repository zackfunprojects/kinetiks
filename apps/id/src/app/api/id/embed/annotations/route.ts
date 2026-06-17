import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { captureException, USER_SAFE } from "@/lib/observability/sentry";
import { annotationIntentSchema } from "@/lib/embed/contract";
import type { Json } from "@kinetiks/supabase";

/**
 * POST /api/id/embed/annotations
 *
 * Persists create / dismiss / pin / reply intents to `kinetiks_annotations`
 * (admin client; account + thread scoped; service-role write per the table's
 * RLS). The table is in the `supabase_realtime` publication, so subscribed
 * clients see the change via postgres_changes (write-before-publish). All
 * reference-surface annotations are labeled `source_app='kinetiks_fixtures'`.
 *
 * Pin -> Learning Ledger (spec §6.2) is a follow-up: it needs a dedicated
 * ledger event type (a small migration); the `pinned` field persists here.
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

  const parsed = annotationIntentSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid annotation intent", 400);

  const intent = parsed.data;
  const accountId = auth.account_id;
  const admin = createAdminClient();

  try {
    if (intent.op === "create") {
      const { data, error: insertErr } = await admin
        .from("kinetiks_annotations")
        .insert({
          account_id: accountId,
          thread_id: intent.thread_id,
          kind: intent.kind,
          component_id: intent.component_id,
          field_name: intent.field_name,
          position: intent.position,
          summary: intent.summary,
          body: intent.body,
          source_app: "kinetiks_fixtures",
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      return apiSuccess({ accepted: true, op: "create", id: data.id });
    }

    if (intent.op === "dismiss" || intent.op === "pin") {
      const patch = intent.op === "dismiss" ? { dismissed: true } : { pinned: true };
      const { data, error: updErr } = await admin
        .from("kinetiks_annotations")
        .update(patch)
        .eq("id", intent.annotation_id)
        .eq("account_id", accountId)
        .select("id");
      if (updErr) throw updErr;
      if (!data || data.length === 0) return apiError("Annotation not found", 404);
      return apiSuccess({ accepted: true, op: intent.op, id: intent.annotation_id });
    }

    // reply: append to the replies jsonb (read-modify-write, account-scoped).
    const { data: row, error: fetchErr } = await admin
      .from("kinetiks_annotations")
      .select("replies")
      .eq("id", intent.annotation_id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!row) return apiError("Annotation not found", 404);

    const replies = Array.isArray(row.replies) ? row.replies : [];
    const reply: Json = {
      id: crypto.randomUUID(),
      participant: "user",
      body: intent.body,
      created_at: new Date().toISOString(),
    };
    const { error: replyErr } = await admin
      .from("kinetiks_annotations")
      .update({ replies: [...replies, reply] })
      .eq("id", intent.annotation_id)
      .eq("account_id", accountId);
    if (replyErr) throw replyErr;
    return apiSuccess({ accepted: true, op: "reply", id: intent.annotation_id });
  } catch (err) {
    await captureException(err, {
      tags: { route: "/api/id/embed/annotations", action: "embed.annotations", stage: "persist", app: "id" },
      user: { id: accountId },
      extra: { op: intent.op, threadId: intent.thread_id },
    });
    return apiError(USER_SAFE.GENERIC_ERROR, 500);
  }
}
