import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { NextRequest } from "next/server";

/**
 * GET /api/oracle/insights
 * Get active insights for the Analytics tab.
 */
export async function GET(request: NextRequest) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10);

  const admin = createAdminClient();

  const { data: insights, error: queryError } = await admin
    .from("kinetiks_oracle_insights")
    .select("*")
    .eq("account_id", auth.account_id)
    .eq("dismissed", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (queryError) return apiError("Failed to fetch insights", 500);

  return apiSuccess({ insights: insights ?? [] });
}

/**
 * PATCH /api/oracle/insights
 * Dismiss or act on an insight. Body: { id: string, dismissed?: boolean, acted_on?: boolean }
 */
export async function PATCH(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: { id: string; dismissed?: boolean; acted_on?: boolean };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.id) return apiError("Insight ID required", 400);

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {};

  if (body.dismissed !== undefined) updates.dismissed = body.dismissed;
  if (body.acted_on !== undefined) updates.acted_on = body.acted_on;

  const { error: updateError } = await admin
    .from("kinetiks_oracle_insights")
    .update(updates)
    .eq("id", body.id)
    .eq("account_id", auth.account_id);

  if (updateError) return apiError("Failed to update insight", 500);

  return apiSuccess({ updated: true });
}
