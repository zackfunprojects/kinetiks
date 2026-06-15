import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { annotationsChannel } from "@kinetiks/supabase";
import { annotationIntentSchema } from "@/lib/embed/contract";

/**
 * POST /api/id/embed/annotations
 *
 * Create / dismiss / pin / reply to an annotation, scoped to the caller's
 * account + thread (`annotations:{account}:{thread}`). Phase 8.0 scaffold:
 * auth + thread scope + intent validation are real; the write-before-publish
 * to kinetiks_annotations + broadcast lands in Phase 8.4 (after `db:types`).
 * All reference-surface annotations are labeled source_app='kinetiks_fixtures'.
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

  const channel = annotationsChannel(auth.account_id, parsed.data.thread_id);
  return apiSuccess({ accepted: true, op: parsed.data.op, channel });
}
