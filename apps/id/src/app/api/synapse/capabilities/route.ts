import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * GET /api/synapse/capabilities
 * List all registered capabilities across all connected Synapses.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const { data: synapses, error: queryError } = await admin
    .from("kinetiks_synapses")
    .select("app_name, capabilities, status")
    .eq("account_id", auth.account_id)
    .not("capabilities", "is", null);

  if (queryError) {
    return apiError(`Failed to fetch capabilities: ${queryError.message}`, 500);
  }

  const allCapabilities = (synapses ?? []).map((s) => ({
    app_name: s.app_name,
    status: s.status,
    capabilities: s.capabilities,
  }));

  return apiSuccess({ apps: allCapabilities });
}
