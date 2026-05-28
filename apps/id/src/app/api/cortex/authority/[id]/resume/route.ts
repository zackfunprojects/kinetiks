/**
 * POST /api/cortex/authority/[id]/resume
 *
 * Customer action on the Cortex Authority sub-tab: resume a paused
 * grant. Re-enables covered actions immediately. The dedicated
 * `authority_grant_resumed` Ledger event captures the audit trail.
 *
 * Phase 4 — Chunk 9.
 */
import { z } from "zod";

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { resumeGrant } from "@/lib/cortex/authority/lifecycle";
import { captureException, USER_SAFE } from "@/lib/observability/sentry";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const resumeBodySchema = z.object({
  reason: z.string().max(2000).optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  const { id: grant_id } = await params;
  if (!grant_id) return apiError("Missing grant id", 400);

  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  // Read raw text first so empty body (legitimate, optional reason)
  // is distinguishable from malformed JSON (must 400). Silently
  // swallowing JSON parse errors on a mutating endpoint hides client
  // bugs and routes around the validator.
  //
  // Use bodyText.length, NOT trim(): whitespace-only bodies are not
  // "empty" — they are malformed JSON and must hit the 400 path.
  const bodyText = await request.text();
  let raw: unknown = {};
  if (bodyText.length > 0) {
    try {
      raw = JSON.parse(bodyText);
    } catch {
      return apiError("Invalid JSON body", 400);
    }
  }
  const parsed = resumeBodySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.join(".") ?? "body";
    return apiError(`invalid resume payload at '${path}'`, 400);
  }

  const admin = createAdminClient();
  try {
    await resumeGrant(admin, {
      account_id: auth.account_id,
      user_id: auth.user_id,
      grant_id,
      reason: parsed.data.reason,
    });
    return apiSuccess({ grant_id, status: "active" });
  } catch (err) {
    await captureException(err, {
      tags: {
        app: "id",
        route: "/api/cortex/authority/[id]/resume",
        action: "authority.resume",
        stage: "execute",
      },
      user: { id: auth.account_id },
      extra: { grantId: grant_id },
    });
    return apiError(USER_SAFE.GENERIC_PERMISSION_RESUME, 500);
  }
}
