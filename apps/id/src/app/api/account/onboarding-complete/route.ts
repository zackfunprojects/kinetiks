import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * PATCH /api/account/onboarding-complete
 *
 * Mark the authenticated user's account as onboarding complete.
 */
export async function PATCH(request: Request): Promise<Response> {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  const admin = createAdminClient();

  const { data: updated, error: updateError } = await admin
    .from("kinetiks_accounts")
    .update({
      onboarding_complete: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.account_id)
    .select("id");

  if (updateError) {
    console.error("Failed to mark onboarding complete:", updateError.message);
    return apiError("Failed to update account", 500);
  }

  if (!updated || updated.length !== 1) {
    return apiError("Account not found or update affected unexpected rows", 404);
  }

  return apiSuccess({ onboarding_complete: true });
}
