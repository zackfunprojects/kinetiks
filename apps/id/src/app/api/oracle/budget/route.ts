import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { calculateBudgetPacing } from "@/lib/oracle/budget-tracker";

/**
 * GET /api/oracle/budget
 * Get budget pacing data for the current active budget.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  try {
    const pacing = await calculateBudgetPacing(auth.account_id);
    return apiSuccess({ pacing });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to calculate pacing";
    return apiError(message, 500);
  }
}
