import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * GET /api/summary/daily-brief
 * Returns a pre-composed daily snapshot for agents and MCP:
 * - Confidence scores
 * - Pending approvals count
 * - Recent ledger activity (last 24h)
 * - Active connections status
 * - Active app activations
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const [
    confidenceResult,
    pendingResult,
    ledgerResult,
    connectionsResult,
    appsResult,
  ] = await Promise.all([
    admin
      .from("kinetiks_confidence")
      .select("org, products, voice, customers, narrative, competitive, market, brand, aggregate, updated_at")
      .eq("account_id", auth.account_id)
      .maybeSingle(),
    admin
      .from("kinetiks_proposals")
      .select("id", { count: "exact", head: true })
      .eq("account_id", auth.account_id)
      .eq("status", "escalated"),
    admin
      .from("kinetiks_ledger")
      .select("event_type, source_app, target_layer, created_at")
      .eq("account_id", auth.account_id)
      .gte("created_at", twentyFourHoursAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("kinetiks_connections")
      .select("provider, status, last_sync_at")
      .eq("account_id", auth.account_id)
      .neq("status", "revoked"),
    admin
      .from("kinetiks_app_activations")
      .select("app_name, status")
      .eq("account_id", auth.account_id)
      .eq("status", "active"),
  ]);

  if (confidenceResult.error) {
    return apiError("Failed to fetch daily brief data", 500);
  }

  // Summarize ledger activity
  const activityCounts: Record<string, number> = {};
  for (const entry of ledgerResult.data ?? []) {
    const type = entry.event_type as string;
    activityCounts[type] = (activityCounts[type] ?? 0) + 1;
  }

  return apiSuccess({
    confidence: confidenceResult.data,
    pending_approvals: pendingResult.count ?? 0,
    activity_last_24h: {
      total: (ledgerResult.data ?? []).length,
      by_type: activityCounts,
    },
    connections: (connectionsResult.data ?? []).map((c) => ({
      provider: c.provider,
      status: c.status,
      last_sync_at: c.last_sync_at,
    })),
    active_apps: (appsResult.data ?? []).map((a) => a.app_name),
  });
}
