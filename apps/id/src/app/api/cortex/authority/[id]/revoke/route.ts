/**
 * POST /api/cortex/authority/[id]/revoke
 *
 * Customer action on the Cortex Authority sub-tab: revoke an active
 * or paused grant. Terminal — cannot be undone. Body must include a
 * `reason` so the audit trail captures why the customer revoked.
 *
 * Phase 4 — Chunk 9.
 */
import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { revokeGrant } from "@/lib/cortex/authority/lifecycle";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface RevokeBody {
  reason?: string;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id: grant_id } = await params;
  if (!grant_id) return apiError("Missing grant id", 400);

  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: RevokeBody = {};
  try {
    body = (await request.json()) as RevokeBody;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (typeof body.reason !== "string" || body.reason.trim().length === 0) {
    return apiError("reason is required when revoking", 400);
  }
  if (body.reason.length > 2000) {
    return apiError("reason exceeds 2000 characters", 400);
  }

  const admin = createAdminClient();
  try {
    await revokeGrant(admin, {
      account_id: auth.account_id,
      user_id: auth.user_id,
      grant_id,
      reason: body.reason,
    });
    return apiSuccess({ grant_id, status: "revoked" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "revoke failed";
    return apiError(message, 500);
  }
}
