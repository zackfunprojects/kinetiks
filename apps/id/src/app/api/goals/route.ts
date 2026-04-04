import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { validateCreateGoal, validateUpdateGoal } from "@/lib/goals/schema";
import type { CreateGoalInput, UpdateGoalInput } from "@/lib/goals/types";
import { NextRequest } from "next/server";

/**
 * GET /api/goals
 * List goals for the account.
 * Query: ?status=active (default) | paused | completed | archived | all
 */
export async function GET(request: NextRequest) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const status = params.get("status") ?? "active";

  const admin = createAdminClient();

  let query = admin
    .from("kinetiks_goals")
    .select("*")
    .eq("account_id", auth.account_id);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  query = query.order("created_at", { ascending: false });

  const { data: goals, error: queryError } = await query;

  if (queryError) {
    return apiError(`Failed to fetch goals: ${queryError.message}`, 500);
  }

  return apiSuccess({ goals: goals ?? [] });
}

/**
 * POST /api/goals
 * Create a new goal.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: CreateGoalInput;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const validationError = validateCreateGoal(body);
  if (validationError) {
    return apiError(validationError, 400);
  }

  const admin = createAdminClient();

  const { data: goal, error: insertError } = await admin
    .from("kinetiks_goals")
    .insert({
      account_id: auth.account_id,
      name: body.name.trim(),
      type: body.type,
      metric_key: body.metric_key ?? null,
      target_value: body.target_value ?? null,
      target_period: body.target_period ?? null,
      direction: body.direction ?? "above",
      contributing_apps: body.contributing_apps ?? [],
      parent_goal_id: body.parent_goal_id ?? null,
      period_start: body.period_start ?? null,
      period_end: body.period_end ?? null,
    })
    .select()
    .single();

  if (insertError) {
    return apiError(`Failed to create goal: ${insertError.message}`, 500);
  }

  return apiSuccess(goal);
}

/**
 * PATCH /api/goals
 * Update a goal. Body: { id: string, ...updates }
 */
export async function PATCH(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: UpdateGoalInput & { id: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.id) {
    return apiError("Goal ID is required", 400);
  }

  const validationError = validateUpdateGoal(body);
  if (validationError) {
    return apiError(validationError, 400);
  }

  const admin = createAdminClient();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.target_value !== undefined) updates.target_value = body.target_value;
  if (body.target_period !== undefined) updates.target_period = body.target_period;
  if (body.direction !== undefined) updates.direction = body.direction;
  if (body.status !== undefined) updates.status = body.status;
  if (body.contributing_apps !== undefined) updates.contributing_apps = body.contributing_apps;
  if (body.period_start !== undefined) updates.period_start = body.period_start;
  if (body.period_end !== undefined) updates.period_end = body.period_end;

  const { data: goal, error: updateError } = await admin
    .from("kinetiks_goals")
    .update(updates)
    .eq("id", body.id)
    .eq("account_id", auth.account_id)
    .select()
    .single();

  if (updateError) {
    return apiError(`Failed to update goal: ${updateError.message}`, 500);
  }

  return apiSuccess(goal);
}
