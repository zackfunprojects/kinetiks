import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * PATCH /api/account/onboarding-complete
 *
 * Mark the authenticated user's account as onboarding complete.
 */
export async function PATCH(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const { error: updateError } = await admin
    .from("kinetiks_accounts")
    .update({
      onboarding_complete: true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", auth.user_id);

  if (updateError) {
    console.error("Failed to mark onboarding complete:", updateError.message);
    return apiError("Failed to update account", 500);
  }

  return apiSuccess({ onboarding_complete: true });
}
