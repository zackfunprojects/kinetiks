import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * GET /api/budgets
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const { data: budgets, error: queryError } = await admin
    .from("kinetiks_budgets")
    .select("*, kinetiks_budget_allocations(*)")
    .eq("account_id", auth.account_id)
    .order("period_start", { ascending: false });

  if (queryError) {
    return apiError(`Failed to fetch budgets: ${queryError.message}`, 500);
  }

  return apiSuccess({ budgets: budgets ?? [] });
}

/**
 * POST /api/budgets
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: {
    total_budget: number;
    currency?: string;
    period: string;
    period_start: string;
    period_end: string;
    allocations?: { category: string; app?: string; allocated_amount: number }[];
  };

  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (body.total_budget === undefined || body.total_budget === null || !body.period || !body.period_start || !body.period_end) {
    return apiError("Missing required fields: total_budget, period, period_start, period_end", 400);
  }

  const admin = createAdminClient();

  const { data: budget, error: insertError } = await admin
    .from("kinetiks_budgets")
    .insert({
      account_id: auth.account_id,
      total_budget: body.total_budget,
      currency: body.currency ?? "USD",
      period: body.period,
      period_start: body.period_start,
      period_end: body.period_end,
    })
    .select()
    .single();

  if (insertError || !budget) {
    return apiError(`Failed to create budget: ${insertError?.message ?? "Unknown error"}`, 500);
  }

  if (body.allocations?.length) {
    const { error: allocError } = await admin.from("kinetiks_budget_allocations").insert(
      body.allocations.map((a) => ({
        budget_id: budget.id,
        category: a.category,
        app: a.app ?? null,
        allocated_amount: a.allocated_amount,
      }))
    );

    if (allocError) {
      return apiError(`Budget created but allocations failed: ${allocError.message}`, 500);
    }
  }

  return apiSuccess(budget);
}
