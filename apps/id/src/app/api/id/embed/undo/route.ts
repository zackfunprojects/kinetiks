import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { workspaceChannel } from "@kinetiks/supabase";
import { undoRequestSchema } from "@/lib/embed/contract";

/**
 * POST /api/id/embed/undo
 *
 * Apply an undo for a shared-undo-stack action, scoped to the caller's
 * account + thread (`workspace:{account}:{thread}`). Phase 8.0 scaffold:
 * auth + thread scope + shape validation are real; applying the undo against
 * kinetiks_workspace_actions + broadcasting the new stack lands in Phase 8.5
 * (after `db:types`).
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

  const parsed = undoRequestSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid undo request", 400);

  const channel = workspaceChannel(auth.account_id, parsed.data.thread_id);
  return apiSuccess({ accepted: true, action_id: parsed.data.action_id, channel });
}
