import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import type { DealStage } from "@/types/pipeline";

const VALID_STAGES: DealStage[] = ["prospecting", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"];
const CLOSED_STAGES: DealStage[] = ["closed_won", "closed_lost"];

interface RouteContext {
  params: { id: string };
}

/**
 * PATCH /api/hv/deals/[id]/stage
 * Move a deal between stages (used by Kanban drag-drop).
 * Sets/clears closed_at automatically.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: { stage: string };
  try {
    const parsed = await request.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed as { stage: string };
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.stage || !VALID_STAGES.includes(body.stage as DealStage)) {
    return apiError(`Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}`, 400);
  }

  const newStage = body.stage as DealStage;
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Get current stage for activity log
  const { data: deal } = await admin
    .from("hv_deals")
    .select("id, stage, name, contact_id, org_id")
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id)
    .single();

  if (!deal) {
    return apiError("Deal not found", 404);
  }

  const oldStage = deal.stage as DealStage;
  if (oldStage === newStage) {
    return apiSuccess(deal);
  }

  // Build update
  const updates: Record<string, unknown> = {
    stage: newStage,
    updated_at: now,
  };

  // Set closed_at when moving to a closed stage
  if (CLOSED_STAGES.includes(newStage)) {
    updates.closed_at = now;
  }
  // Clear closed_at when moving FROM a closed stage back to open
  if (CLOSED_STAGES.includes(oldStage) && !CLOSED_STAGES.includes(newStage)) {
    updates.closed_at = null;
  }

  const { data: updated, error: updateError } = await admin
    .from("hv_deals")
    .update(updates)
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id)
    .select("*")
    .single();

  if (updateError) {
    return apiError(`Failed to update stage: ${updateError.message}`, 500);
  }

  // Log stage change activity
  await admin.from("hv_activities").insert({
    kinetiks_id: auth.account_id,
    deal_id: params.id,
    contact_id: deal.contact_id,
    org_id: deal.org_id,
    type: "deal_stage_changed",
    content: {
      from_stage: oldStage,
      to_stage: newStage,
      detail: `Moved "${deal.name}" from ${oldStage} to ${newStage}`,
    },
    source_app: "harvest",
  });

  return apiSuccess(updated);
}
