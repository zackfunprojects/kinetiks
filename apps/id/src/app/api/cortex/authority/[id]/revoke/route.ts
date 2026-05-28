/**
 * POST /api/cortex/authority/[id]/revoke
 *
 * Customer action on the Cortex Authority sub-tab: revoke an active
 * or paused grant. Terminal — cannot be undone. Body must include a
 * non-empty `reason` so the audit trail captures why the customer
 * revoked.
 *
 * Phase 4 — Chunk 9.
 */
import { z } from "zod";

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { revokeGrant } from "@/lib/cortex/authority/lifecycle";
import { captureException, USER_SAFE } from "@/lib/observability/sentry";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const revokeBodySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "reason is required when revoking")
    .max(2000),
});

export async function POST(request: Request, { params }: RouteParams) {
  const { id: grant_id } = await params;
  if (!grant_id) return apiError("Missing grant id", 400);

  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = revokeBodySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first?.message ?? "invalid revoke payload";
    return apiError(message, 400);
  }

  const admin = createAdminClient();
  try {
    await revokeGrant(admin, {
      account_id: auth.account_id,
      user_id: auth.user_id,
      grant_id,
      reason: parsed.data.reason,
    });
    return apiSuccess({ grant_id, status: "revoked" });
  } catch (err) {
    await captureException(err, {
      tags: {
        app: "id",
        route: "/api/cortex/authority/[id]/revoke",
        action: "authority.revoke",
        stage: "execute",
      },
      user: { id: auth.account_id },
      extra: { grantId: grant_id },
    });
    return apiError(USER_SAFE.GENERIC_PERMISSION_REVOKE, 500);
  }
}
