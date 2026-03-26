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

  let newStage: DealStage;
  try {
    const parsed = await request.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return apiError("Invalid JSON body", 400);
    }
    if (typeof parsed.stage !== "string") {
      return apiError("stage must be a string", 400);
    }
    if (!VALID_STAGES.includes(parsed.stage as DealStage)) {
      return apiError(`Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}`, 400);
    }
    newStage = parsed.stage as DealStage;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid JSON body";
    return apiError(msg, 400);
  }
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Get current stage for activity log
  const { data: deal, error: readError } = await admin
    .from("hv_deals")
    .select("id, stage, name, contact_id, org_id")
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id)
    .maybeSingle();

  if (readError) {
    return apiError(`Failed to load deal: ${readError.message}`, 500);
  }
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
  const { error: activityError } = await admin.from("hv_activities").insert({
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
  if (activityError) {
    console.error("Failed to log stage change activity:", activityError.message);
  }

  return apiSuccess(updated);
}
