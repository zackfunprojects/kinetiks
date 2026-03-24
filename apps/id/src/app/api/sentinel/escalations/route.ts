import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import type { EscalationStatus } from "@kinetiks/types";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * GET /api/sentinel/escalations
 *
 * List pending escalations for the authenticated user's account.
 * Supports ?status= filter and ?limit= pagination.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "pending";
  const validStatuses = ["pending", "acknowledged", "resolved", "all"];
  if (!validStatuses.includes(status)) {
    return apiError(`Invalid status: ${status}. Must be one of: ${validStatuses.join(", ")}`, 400);
  }

  const parsedLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return apiError("Invalid limit: must be a number between 1 and 100", 400);
  }

  const query = admin
    .from("kinetiks_escalations")
    .select("*")
    .eq("account_id", auth.account_id)
    .order("created_at", { ascending: false })
    .limit(parsedLimit);

  if (status !== "all") {
    query.eq("status", status);
  }

  const { data: escalations, error: queryError } = await query;

  if (queryError) {
    return apiError("Failed to fetch escalations", 500);
  }

  return apiSuccess({ escalations: escalations ?? [] });
}

/**
 * PATCH /api/sentinel/escalations
 *
 * Acknowledge or resolve an escalation.
 * Body: { escalation_id: string, status: 'acknowledged' | 'resolved' }
 */
export async function PATCH(request: Request): Promise<Response> {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: { escalation_id: string; status: EscalationStatus };
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const { escalation_id, status } = body;

  if (!escalation_id || typeof escalation_id !== "string") {
    return apiError("Missing or invalid escalation_id", 400);
  }

  if (!["acknowledged", "resolved"].includes(status)) {
    return apiError("status must be 'acknowledged' or 'resolved'", 400);
  }

  const admin = createAdminClient();

  const updateData: Record<string, unknown> = { status };
  if (status === "acknowledged") {
    updateData.acknowledged_at = new Date().toISOString();
  } else if (status === "resolved") {
    updateData.resolved_at = new Date().toISOString();
  }

  const { data: updated, error: updateError } = await admin
    .from("kinetiks_escalations")
    .update(updateData)
    .eq("id", escalation_id)
    .eq("account_id", auth.account_id)
    .select("id");

  if (updateError) {
    return apiError("Failed to update escalation", 500);
  }

  if (!updated || updated.length === 0) {
    return apiError("Escalation not found", 404);
  }

  return apiSuccess({ updated: true, status });
}
