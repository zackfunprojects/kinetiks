import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import {
  calculateOverviewMetrics,
  calculateCampaignMetrics,
  calculateSequenceMetrics,
} from "@/lib/analytics/calculate";

type AnalyticsView = "overview" | "campaigns" | "sequences";

/**
 * GET /api/hv/analytics?view=overview|campaigns|sequences
 * Returns email analytics for the authenticated account.
 *
 * Metrics are calculated live from hv_emails, hv_campaigns,
 * hv_sequences, and hv_enrollments tables.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const url = new URL(request.url);
  const view = (url.searchParams.get("view") ?? "overview") as AnalyticsView;

  try {
    if (view === "overview") {
      const metrics = await calculateOverviewMetrics(auth.account_id);
      return apiSuccess(metrics);
    }

    if (view === "campaigns") {
      const metrics = await calculateCampaignMetrics(auth.account_id);
      return apiSuccess(metrics);
    }

    if (view === "sequences") {
      const metrics = await calculateSequenceMetrics(auth.account_id);
      return apiSuccess(metrics);
    }

    return apiError(`Invalid view: ${view}. Use overview, campaigns, or sequences.`, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error calculating analytics";
    console.error("[analytics] Error:", message);
    return apiError(message, 500);
  }
}
