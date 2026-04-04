import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import type { SynapseCapabilities } from "@kinetiks/synapse";

/**
 * POST /api/synapse/register
 * Synapse registers its capabilities on activation.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: SynapseCapabilities;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.app_name || !body.capabilities) {
    return apiError("Missing required fields: app_name, capabilities", 400);
  }

  const admin = createAdminClient();

  const { error: updateError } = await admin
    .from("kinetiks_synapses")
    .update({
      capabilities: body,
      updated_at: new Date().toISOString(),
    })
    .eq("account_id", auth.account_id)
    .eq("app_name", body.app_name);

  if (updateError) {
    return apiError("Failed to register capabilities", 500);
  }

  return apiSuccess({ registered: true, app_name: body.app_name });
}
