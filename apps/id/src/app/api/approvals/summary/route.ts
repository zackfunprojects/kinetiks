import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * GET /api/approvals/summary
 * Returns counts of escalated proposals grouped by app and layer.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const { data: escalated, error: fetchError } = await admin
    .from("kinetiks_proposals")
    .select("id, source_app, target_layer, submitted_at")
    .eq("account_id", auth.account_id)
    .eq("status", "escalated")
    .order("submitted_at", { ascending: true });

  if (fetchError) {
    console.error("Failed to fetch approval summary:", fetchError.message);
    return apiError("Failed to fetch approval summary", 500);
  }

  const items = escalated ?? [];

  const byApp: Record<string, number> = {};
  const byLayer: Record<string, number> = {};

  for (const item of items) {
    const app = item.source_app as string;
    const layer = item.target_layer as string;
    byApp[app] = (byApp[app] ?? 0) + 1;
    byLayer[layer] = (byLayer[layer] ?? 0) + 1;
  }

  return apiSuccess({
    pending: items.length,
    by_app: byApp,
    by_layer: byLayer,
    oldest_submitted_at: items.length > 0 ? items[0].submitted_at : null,
  });
}
