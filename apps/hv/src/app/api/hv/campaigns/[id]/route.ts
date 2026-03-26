import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import type { CampaignStatus } from "@/types/campaigns";

const VALID_STATUSES: CampaignStatus[] = ["draft", "active", "paused", "completed"];

interface RouteContext {
  params: { id: string };
}

/**
 * GET /api/hv/campaigns/:id
 */
export async function GET(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const { id } = params;
  const admin = createAdminClient();

  const { data, error: queryError } = await admin
    .from("hv_campaigns")
    .select("*, hv_sequences(name)")
    .eq("id", id)
    .eq("kinetiks_id", auth.account_id)
    .single();

  if (queryError) return apiError("Campaign not found", 404);

  const seq = data.hv_sequences as { name: string } | null;
  return apiSuccess({
    ...data,
    sequence_name: seq?.name ?? null,
    hv_sequences: undefined,
  });
}

/**
 * PATCH /api/hv/campaigns/:id
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const { id } = params;

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

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string") updates.name = body.name;
  if (body.sequence_id !== undefined) updates.sequence_id = body.sequence_id;
  if (body.prospect_filter !== undefined) updates.prospect_filter = body.prospect_filter;
  if (typeof body.playbook_type === "string" || body.playbook_type === null) {
    updates.playbook_type = body.playbook_type;
  }
  if (typeof body.status === "string" && VALID_STATUSES.includes(body.status as CampaignStatus)) {
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return apiError("No valid fields to update", 400);
  }

  updates.updated_at = new Date().toISOString();

  const admin = createAdminClient();

  const { data, error: updateError } = await admin
    .from("hv_campaigns")
    .update(updates)
    .eq("id", id)
    .eq("kinetiks_id", auth.account_id)
    .select("*")
    .single();

  if (updateError) return apiError(updateError.message, 500);
  return apiSuccess(data);
}

/**
 * DELETE /api/hv/campaigns/:id
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const { id } = params;
  const admin = createAdminClient();

  const { error: deleteError } = await admin
    .from("hv_campaigns")
    .delete()
    .eq("id", id)
    .eq("kinetiks_id", auth.account_id);

  if (deleteError) return apiError(deleteError.message, 500);
  return apiSuccess({ deleted: true });
}
