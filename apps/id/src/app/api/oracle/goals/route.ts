import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { calculateGoalProgress } from "@/lib/oracle/goal-tracker";
import type { Goal } from "@/lib/goals/types";

/**
 * GET /api/oracle/goals
 * Get goal progress data for all active goals.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const { data: goals, error: goalError } = await admin
    .from("kinetiks_goals")
    .select("*")
    .eq("account_id", auth.account_id)
    .in("status", ["active", "paused"]);

  if (goalError) return apiError(`Failed to fetch goals: ${goalError.message}`, 500);

  const progress = await Promise.all(
    ((goals ?? []) as Goal[]).map(async (goal) => {
      const { data: snapshots, error: snapshotError } = await admin
        .from("kinetiks_goal_snapshots")
        .select("value")
        .eq("goal_id", goal.id)
        .order("snapshot_at", { ascending: true })
        .limit(30);

      if (snapshotError) {
        return apiError(`Failed to fetch snapshots for goal ${goal.id}: ${snapshotError.message}`, 500);
      }

      const values = (snapshots ?? []).map((s: { value: number }) => s.value);
      return calculateGoalProgress(goal, values);
    })
  );

  // If any snapshot fetch returned an error Response, return it
  for (const p of progress) {
    if (p instanceof Response) return p;
  }

  return apiSuccess({ goals: progress });
}
