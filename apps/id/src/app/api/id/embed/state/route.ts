import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

const stateQuerySchema = z.object({ thread: z.string().min(1) });

/**
 * GET /api/id/embed/state?thread=...
 *
 * Hydrates the collaborative surface for a thread: annotations, the shared
 * undo stack, and the active task. Phase 8.0 scaffold — the account + thread
 * scope boundary is real (requireAuth resolves account_id from the JWT); the
 * live reads of kinetiks_annotations / _workspace_actions / _active_tasks land
 * in Phases 8.3–8.5 (after `pnpm db:types` regenerates the new tables).
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-only" });
  if (error) return error;

  const parsed = stateQuerySchema.safeParse({
    thread: new URL(request.url).searchParams.get("thread"),
  });
  if (!parsed.success) return apiError("thread is required", 400);

  return apiSuccess({
    account_id: auth.account_id,
    thread_id: parsed.data.thread,
    annotations: [],
    undo_stack: [],
    active_task: null,
  });
}
