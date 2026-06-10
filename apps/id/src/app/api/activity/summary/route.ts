import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { captureException } from "@/lib/observability/sentry";
import { loadAgentActivitySummary } from "@/lib/activity/summary";

/**
 * GET /api/activity/summary
 *
 * B4 — read-only agent-activity summary for the chat rail: what the
 * operators did in the last 24 hours, narrated from rows that already
 * exist (kinetiks_oracle_runs, kinetiks_ledger, kinetiks_tool_calls).
 * No new instrumentation; nothing here mutates state.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  try {
    const summary = await loadAgentActivitySummary(admin, auth.account_id);
    return apiSuccess({ summary });
  } catch (err) {
    await captureException(err, {
      tags: {
        route: "/api/activity/summary",
        action: "activity.summary",
        stage: "aggregate",
        app: "id",
      },
      user: { id: auth.account_id },
      extra: {},
    });
    return apiError("We couldn't load recent activity. Try again.", 500);
  }
}
