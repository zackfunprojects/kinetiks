/**
 * POST /api/cortex/authority/[id]/pause
 *
 * Customer action on the Cortex Authority sub-tab: pause an active
 * grant. Halts new actions immediately (the resolver returns null for
 * non-active grants). In-flight calls finish on their own.
 *
 * Phase 4 — Chunk 9.
 */
import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { pauseGrant } from "@/lib/cortex/authority/lifecycle";
import { captureException, USER_SAFE } from "@/lib/observability/sentry";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface PauseBody {
  reason?: string;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id: grant_id } = await params;
  if (!grant_id) return apiError("Missing grant id", 400);

  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: PauseBody = {};
  try {
    body = (await request.json()) as PauseBody;
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
    await pauseGrant(admin, {
      account_id: auth.account_id,
      user_id: auth.user_id,
      grant_id,
      reason: body.reason,
    });
    return apiSuccess({ grant_id, status: "paused" });
  } catch (err) {
    // Internal lifecycle errors carry `[authority/lifecycle]` prefixes
    // that must not leak to the customer (CLAUDE.md). Capture full
    // detail to Sentry; return the user-safe constant.
    await captureException(err, {
      tags: {
        app: "id",
        route: "/api/cortex/authority/[id]/pause",
        action: "authority.pause",
        stage: "execute",
      },
      user: { id: auth.account_id },
      extra: { grantId: grant_id },
    });
    return apiError(USER_SAFE.GENERIC_PERMISSION_PAUSE, 500);
  }
}
