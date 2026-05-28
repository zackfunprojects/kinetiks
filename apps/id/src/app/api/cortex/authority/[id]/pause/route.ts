/**
 * POST /api/cortex/authority/[id]/pause
 *
 * Customer action on the Cortex Authority sub-tab: pause an active
 * grant. Halts new actions immediately (the resolver returns null for
 * non-active grants). In-flight calls finish on their own.
 *
 * Phase 4 — Chunk 9.
 */
import { z } from "zod";

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { pauseGrant } from "@/lib/cortex/authority/lifecycle";
import { captureException, USER_SAFE } from "@/lib/observability/sentry";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const pauseBodySchema = z.object({
  reason: z.string().max(2000).optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  const { id: grant_id } = await params;
  if (!grant_id) return apiError("Missing grant id", 400);

  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  // Body is optional — an empty POST means "pause with no reason".
  // Read raw text first so we can tell empty body (legitimate) from a
  // malformed-JSON body (must 400). Silently swallowing JSON errors on
  // a mutating endpoint hides client bugs and is the kind of thing
  // the trust layer specifically tries to avoid.
  const bodyText = await request.text();
  let raw: unknown = {};
  if (bodyText.trim().length > 0) {
    try {
      raw = JSON.parse(bodyText);
    } catch {
      return apiError("Invalid JSON body", 400);
    }
  }
  const parsed = pauseBodySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.join(".") ?? "body";
    return apiError(`invalid pause payload at '${path}'`, 400);
  }

  const admin = createAdminClient();
  try {
    await pauseGrant(admin, {
      account_id: auth.account_id,
      user_id: auth.user_id,
      grant_id,
      reason: parsed.data.reason,
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
