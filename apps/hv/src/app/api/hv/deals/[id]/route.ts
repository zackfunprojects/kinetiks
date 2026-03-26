import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { getDealById } from "@/lib/pipeline/queries";

interface RouteContext {
  params: { id: string };
}

/**
 * GET /api/hv/deals/[id]
 * Single deal with activities.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const { deal, dealError, activities, activitiesError } = await getDealById(admin, auth.account_id, params.id);

  if (dealError) {
    return apiError(`Failed to load deal: ${dealError.message}`, 500);
  }
  if (!deal) {
    return apiError("Deal not found", 404);
  }
  if (activitiesError) {
    return apiError(`Failed to load activities: ${activitiesError.message}`, 500);
  }

  return apiSuccess({ ...deal, activities });
}

/**
 * PATCH /api/hv/deals/[id]
 * Update deal fields.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const allowedFields = [
    "name", "value", "currency", "notes", "contact_id", "org_id",
    "win_reason_category", "win_reason_detail",
    "loss_reason_category", "loss_reason_detail", "lost_to_competitor",
    "attribution_campaign_id", "attribution_sequence_id",
    "attribution_channel", "attribution_first_touch_at", "closed_at",
  ];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let hasUpdates = false;
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
      hasUpdates = true;
    }
  }

  if (!hasUpdates) {
    return apiError("No valid fields to update", 400);
  }

  const admin = createAdminClient();
  const { data, error: updateError } = await admin
    .from("hv_deals")
    .update(updates)
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return apiError(`Failed to update deal: ${updateError.message}`, 500);
  }
  if (!data) {
    return apiError("Deal not found", 404);
  }

  return apiSuccess(data);
}

/**
 * DELETE /api/hv/deals/[id]
 * Delete a deal (hard delete with activity log).
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  // Get deal data for activity log
  const { data: deal, error: readError } = await admin
    .from("hv_deals")
    .select("id, name, contact_id, org_id")
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id)
    .maybeSingle();

  if (readError) {
    return apiError(`Failed to read deal: ${readError.message}`, 500);
  }
  if (!deal) {
    return apiError("Deal not found", 404);
  }

  // Delete first, then log activity only on success
  const { error: deleteError } = await admin
    .from("hv_deals")
    .delete()
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id);

  if (deleteError) {
    return apiError(`Failed to delete deal: ${deleteError.message}`, 500);
  }

  // Log deletion activity after successful delete
  const { error: activityError } = await admin.from("hv_activities").insert({
    kinetiks_id: auth.account_id,
    contact_id: deal.contact_id,
    org_id: deal.org_id,
    type: "deal_deleted",
    content: { detail: `Deal "${deal.name}" deleted` },
    source_app: "harvest",
  });
  if (activityError) {
    console.error("Failed to log deal deletion activity:", activityError.message);
  }

  return apiSuccess({ deleted: true });
}
