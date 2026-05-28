/**
 * POST /api/cortex/authority/[id]/narrow
 *
 * Customer action on the Cortex Authority sub-tab: narrow an active
 * grant. Revokes the original with reason `customer_narrowed` AND
 * inserts a tighter `proposed` successor via propose_authority_grants
 * for re-approval. Re-validation of in-flight actions happens at the
 * resolver, which returns null for the now-revoked grant until the
 * successor is approved.
 *
 * Phase 4 — Chunk 9.
 */
import { z } from "zod";

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { narrowGrant } from "@/lib/cortex/authority/lifecycle";
import { proposedGrantPayloadSchema } from "@/lib/operators/descriptors";
import { captureException, USER_SAFE } from "@/lib/observability/sentry";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const narrowBodySchema = z.object({
  successor: proposedGrantPayloadSchema,
  reason: z.string().max(2000).optional(),
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

  const parsed = narrowBodySchema.safeParse(raw);
  if (!parsed.success) {
    // Surface the first issue path; full structural detail goes to
    // Sentry via the route's runtime instrumentation, not to the
    // customer (per CLAUDE.md "never interpolate raw PostgREST or
    // validator messages").
    const first = parsed.error.issues[0];
    const path = first?.path?.join(".") ?? "body";
    return apiError(`invalid narrow payload at '${path}'`, 400);
  }

  const admin = createAdminClient();
  try {
    const result = await narrowGrant(admin, {
      account_id: auth.account_id,
      user_id: auth.user_id,
      grant_id,
      successor: parsed.data.successor,
      reason: parsed.data.reason,
    });
    return apiSuccess({
      grant_id,
      status: "revoked",
      successor_grant_id: result.successor_grant_id,
      successor_approval_id: result.successor_approval_id,
    });
  } catch (err) {
    // Internal `[authority/lifecycle]` paths must not leak to the
    // customer. Capture full detail to Sentry; return the user-safe
    // constant per CLAUDE.md "every failure branch pairs with a generic
    // user-safe message constant".
    await captureException(err, {
      tags: {
        app: "id",
        route: "/api/cortex/authority/[id]/narrow",
        action: "authority.narrow",
        stage: "execute",
      },
      user: { id: auth.account_id },
      extra: { grantId: grant_id },
    });
    return apiError(USER_SAFE.GENERIC_PERMISSION_NARROW, 500);
  }
}
