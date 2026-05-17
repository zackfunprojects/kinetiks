import { requireAuth } from "@/lib/auth/require-auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { buildCapabilityManifest } from "@kinetiks/tools";
import { platformAvailabilityResolvers } from "@/lib/tools/availability";

/**
 * GET /api/tools/capabilities
 *
 * Returns the capability manifest for the authenticated account: tools
 * the account is allowed to invoke, plus all registered action classes
 * and operators. Used by Marcus and external agents to plan tool calls.
 *
 * Manifest shape: see `CapabilityManifest` in `@kinetiks/tools`.
 */
export async function GET(request: Request): Promise<Response> {
  const { auth, error } = await requireAuth(request);
  if (error) return error;
  try {
    const manifest = await buildCapabilityManifest(
      { accountId: auth.account_id, userId: auth.user_id },
      platformAvailabilityResolvers,
    );
    return apiSuccess(manifest);
  } catch (e) {
    return apiError(
      "Failed to build capability manifest",
      500,
      e instanceof Error ? { message: e.message } : undefined,
    );
  }
}
