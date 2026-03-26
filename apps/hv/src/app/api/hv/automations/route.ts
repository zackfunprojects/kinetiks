import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * GET /api/hv/automations
 * Returns operator confidence/automation modes for this account.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const { data, error: queryError } = await admin
    .from("hv_confidence")
    .select("*")
    .eq("kinetiks_id", auth.account_id)
    .order("operator", { ascending: true });

  if (queryError) return apiError(queryError.message, 500);
  return apiSuccess(data ?? []);
}
