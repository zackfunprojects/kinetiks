import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { captureException } from "@/lib/observability/sentry";

const GENERIC_SCHEDULES_LOAD_ERROR = "We couldn't load your brief schedules. Try again.";

/**
 * GET /api/marcus/schedules
 *
 * C2 — list the account's brief schedules for the SettingsModal
 * notifications section. The legacy (dashboard)/marcus/schedules page
 * loaded these server-side; the modal fetches them here.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const { data: schedules, error: loadError } = await admin
    .from("kinetiks_marcus_schedules")
    .select("*")
    .eq("account_id", auth.account_id)
    .order("type", { ascending: true });

  if (loadError) {
    await captureException(new Error(loadError.message), {
      tags: { route: "/api/marcus/schedules", action: "schedules.load", stage: "select", app: "id" },
      user: { id: auth.account_id },
      extra: {},
    });
    return apiError(GENERIC_SCHEDULES_LOAD_ERROR, 500);
  }

  return apiSuccess({ schedules: schedules ?? [] });
}
