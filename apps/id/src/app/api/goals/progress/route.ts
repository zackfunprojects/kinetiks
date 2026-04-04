import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { NextRequest } from "next/server";

/**
 * GET /api/goals/progress?goal_id=xxx
 * Get progress snapshots for a goal. Oracle populates this in Phase 5.
 */
export async function GET(request: NextRequest) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const goalId = request.nextUrl.searchParams.get("goal_id");
  if (!goalId) {
    return apiError("goal_id is required", 400);
  }

  const admin = createAdminClient();

  const { data: snapshots, error: queryError } = await admin
    .from("kinetiks_goal_snapshots")
    .select("*")
    .eq("goal_id", goalId)
    .eq("account_id", auth.account_id)
    .order("snapshot_at", { ascending: true })
    .limit(100);

  if (queryError) {
    return apiError("Failed to fetch progress", 500);
  }

  return apiSuccess({ snapshots: snapshots ?? [] });
}
