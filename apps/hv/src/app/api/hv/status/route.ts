import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * GET /api/hv/status
 *
 * Health check endpoint. Returns app status and auth context.
 * Used to verify auth middleware works correctly.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request, {
    skipRateLimit: true,
  });
  if (error) return error;

  return apiSuccess({
    app: "harvest",
    version: "0.0.1",
    account_id: auth.account_id,
    auth_method: auth.auth_method,
  });
}
