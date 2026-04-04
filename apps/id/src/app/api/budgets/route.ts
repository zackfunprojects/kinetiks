import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * GET /api/budgets
 * List budgets for the account.
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
    return apiError("Failed to fetch budgets", 500);
  }

  return apiSuccess({ budgets: budgets ?? [] });
}

/**
 * POST /api/budgets
 * Create a budget with allocations.
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

  if (!body.total_budget || !body.period || !body.period_start || !body.period_end) {
    return apiError("Missing required fields", 400);
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
    return apiError("Failed to create budget", 500);
  }

  // Insert allocations if provided
  if (body.allocations?.length) {
    await admin.from("kinetiks_budget_allocations").insert(
      body.allocations.map((a) => ({
        budget_id: budget.id,
        category: a.category,
        app: a.app ?? null,
        allocated_amount: a.allocated_amount,
      }))
    );
  }

  return apiSuccess(budget);
}
