/**
 * POST /api/cortex/authority/[id]/resume
 *
 * Customer action on the Cortex Authority sub-tab: resume a paused
 * grant. Re-enables covered actions immediately. The dedicated
 * `authority_grant_resumed` Ledger event captures the audit trail.
 *
 * Phase 4 — Chunk 9.
 */
import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { resumeGrant } from "@/lib/cortex/authority/lifecycle";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ResumeBody {
  reason?: string;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id: grant_id } = await params;
  if (!grant_id) return apiError("Missing grant id", 400);

  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: ResumeBody = {};
  try {
    body = (await request.json()) as ResumeBody;
  } catch {
    // Empty body is fine — `reason` is optional.
  }

  if (body.reason !== undefined && typeof body.reason !== "string") {
    return apiError("reason must be a string when provided", 400);
  }
  if (body.reason && body.reason.length > 2000) {
    return apiError("reason exceeds 2000 characters", 400);
  }

  const admin = createAdminClient();
  try {
    await resumeGrant(admin, {
      account_id: auth.account_id,
      user_id: auth.user_id,
      grant_id,
      reason: body.reason,
    });
    return apiSuccess({ grant_id, status: "active" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "resume failed";
    return apiError(message, 500);
  }
}
