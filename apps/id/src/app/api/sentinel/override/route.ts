import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { processOverride } from "@/lib/sentinel/learning";
import type { OverrideUserAction } from "@kinetiks/types";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

const VALID_ACTIONS: OverrideUserAction[] = [
  "sent_unchanged",
  "edited",
  "rejected",
];

/**
 * PATCH /api/sentinel/override
 *
 * User decision on a held or flagged review.
 * Only user session auth - no service calls. Only humans override Sentinel.
 *
 * Body: { review_id: string, action: OverrideUserAction, edit_diff?: string }
 */
export async function PATCH(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: { review_id: string; action: OverrideUserAction; edit_diff?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const { review_id, action, edit_diff } = body;

  if (!review_id || typeof review_id !== "string") {
    return apiError("Missing or invalid review_id", 400);
  }

  if (!VALID_ACTIONS.includes(action)) {
    return apiError(`Invalid action: ${action}. Must be sent_unchanged, edited, or rejected`, 400);
  }

  const admin = createAdminClient();

  // Verify review exists and belongs to this account
  const { data: review } = await admin
    .from("kinetiks_sentinel_reviews")
    .select("id, verdict")
    .eq("id", review_id)
    .eq("account_id", auth.account_id)
    .single();

  if (!review) {
    return apiError("Review not found", 404);
  }

  // Only held or flagged reviews can be overridden
  const verdict = review.verdict as string;
  if (verdict !== "held" && verdict !== "flagged") {
    return apiError(`Cannot override a review with verdict '${verdict}'. Only held or flagged reviews can be overridden.`, 400);
  }

  const result = await processOverride(admin, auth.account_id, review_id, action, edit_diff);

  if (!result.success) {
    return apiError("Override failed", 500);
  }

  return apiSuccess({ overridden: true });
}
