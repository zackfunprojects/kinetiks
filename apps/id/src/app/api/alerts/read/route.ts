/**
 * POST /api/alerts/read — mark an in-app alert as read (D4).
 *
 * Body: { alert_id: string }
 *
 * Ownership-scoped update with a zero-rows 404 (a stale or foreign id
 * silently succeeding is the bug shape the C2 schedule-toggle fix
 * established the pattern against).
 */

import { z } from "zod";

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { captureException } from "@/lib/observability/sentry";

const BodySchema = z.object({
  alert_id: z.string().uuid(),
});

export async function POST(request: Request): Promise<Response> {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let bodyRaw: unknown;
  try {
    bodyRaw = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const parsed = BodySchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return apiError("alert_id must be a UUID", 400);
  }

  const admin = createAdminClient();
  const { data, error: updateError } = await admin
    .from("kinetiks_marcus_alerts")
    .update({ read: true })
    .eq("id", parsed.data.alert_id)
    .eq("account_id", auth.account_id)
    .select("id");
  if (updateError) {
    await captureException(updateError, {
      tags: { route: "/api/alerts/read", action: "alert.read", stage: "update", app: "id" },
      user: { id: auth.account_id },
      extra: { alert_id: parsed.data.alert_id },
    });
    return apiError("We couldn't update that alert. Try again.", 500);
  }
  if (!data || data.length === 0) {
    return apiError("Alert not found", 404);
  }
  return apiSuccess({ read: true });
}
