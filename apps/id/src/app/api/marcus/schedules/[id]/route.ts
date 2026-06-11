import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { captureException } from "@/lib/observability/sentry";

const GENERIC_SCHEDULE_UPDATE_ERROR = "We couldn't update that schedule. Try again.";

const PatchBody = z.object({
  enabled: z.boolean(),
});

const IdSchema = z.string().uuid();

/**
 * PATCH /api/marcus/schedules/[id]
 *
 * C2 — toggle a brief schedule. SchedulesConfig has PATCHed this path
 * since the legacy shell, but the route never existed, so every toggle
 * 404'd silently. Ownership is enforced by scoping the update to the
 * caller's account and verifying a row actually changed.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  const { id: rawId } = await params;
  const idParse = IdSchema.safeParse(rawId);
  if (!idParse.success) {
    return apiError("Invalid schedule id", 400);
  }

  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await request.json());
  } catch {
    return apiError("Invalid body: { enabled: boolean } required", 400);
  }

  const admin = createAdminClient();

  const { data, error: updateError } = await admin
    .from("kinetiks_marcus_schedules")
    .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
    .eq("id", idParse.data)
    .eq("account_id", auth.account_id)
    .select("id, enabled");

  if (updateError) {
    await captureException(new Error(updateError.message), {
      tags: { route: "/api/marcus/schedules/[id]", action: "schedules.toggle", stage: "update", app: "id" },
      user: { id: auth.account_id },
      extra: { schedule_id: idParse.data },
    });
    return apiError(GENERIC_SCHEDULE_UPDATE_ERROR, 500);
  }

  // Zero rows = not this account's schedule (or a stale id). Never
  // report success for a write that did not happen.
  if (!data || data.length === 0) {
    return apiError("Schedule not found", 404);
  }

  return apiSuccess({ schedule: data[0] });
}
