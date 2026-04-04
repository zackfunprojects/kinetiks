import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { NextRequest } from "next/server";

/**
 * GET /api/approvals/list
 * List approvals with filtering. Sorted: strategic -> review -> quick, then by recency.
 * Query: ?status=pending (default) | approved | rejected | all
 *        &category=outbound_email_cold
 *        &limit=50
 */
export async function GET(request: NextRequest) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const status = params.get("status") ?? "pending";
  const category = params.get("category");
  const limit = Math.min(parseInt(params.get("limit") ?? "50", 10), 200);

  const admin = createAdminClient();

  let query = admin
    .from("kinetiks_approvals")
    .select("*")
    .eq("account_id", auth.account_id);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  if (category) {
    query = query.eq("action_category", category);
  }

  // Sort: strategic first, then review, then quick. Within each: most recent first.
  query = query
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data: approvals, error: queryError } = await query;

  if (queryError) {
    return apiError("Failed to fetch approvals", 500);
  }

  // Re-sort by type priority (strategic > review > quick)
  const typePriority: Record<string, number> = {
    strategic: 0,
    review: 1,
    quick: 2,
  };

  const sorted = (approvals ?? []).sort((a, b) => {
    const aPriority = typePriority[a.approval_type] ?? 1;
    const bPriority = typePriority[b.approval_type] ?? 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return apiSuccess({
    approvals: sorted,
    count: sorted.length,
  });
}
