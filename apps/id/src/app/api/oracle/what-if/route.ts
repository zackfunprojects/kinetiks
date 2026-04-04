import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { modelScenario, type ScenarioInput } from "@/lib/oracle/what-if";
import type { Goal } from "@/lib/goals/types";

/**
 * POST /api/oracle/what-if
 * Model the impact of a variable change.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: ScenarioInput;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.variable || !body.change_type || body.change_value === undefined) {
    return apiError("Missing required fields: variable, change_type, change_value", 400);
  }

  const admin = createAdminClient();

  // Get recent metric values
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: metrics } = await admin
    .from("kinetiks_analytics_metrics")
    .select("metric_value, period_start")
    .eq("account_id", auth.account_id)
    .eq("metric_key", body.variable)
    .gte("period_start", thirtyDaysAgo)
    .order("period_start", { ascending: true });

  const values = (metrics ?? []).map((m: { metric_value: number }) => m.metric_value);
  const currentValue = values.length > 0 ? values[values.length - 1] : 0;

  // Get related goals
  const { data: goals } = await admin
    .from("kinetiks_goals")
    .select("id, target_value, current_value")
    .eq("account_id", auth.account_id)
    .eq("status", "active");

  const goalTargets = ((goals ?? []) as Goal[]).map((g) => ({
    goal_id: g.id,
    target_value: g.target_value ?? 0,
    current_value: g.current_value,
  }));

  const result = modelScenario(body, currentValue, values, goalTargets);

  return apiSuccess({ scenario: result });
}
