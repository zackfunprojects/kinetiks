import { requireAuth } from "@/lib/auth/require-auth";
import { syncGmailReplies } from "@/lib/inbox/gmail-sync";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * POST /api/hv/inbox/sync
 *
 * Triggers a Gmail reply sync for the authenticated account.
 * Accepts either user auth (session/API key) or internal service auth
 * (CRON function calling with INTERNAL_SERVICE_SECRET + x-account-id header).
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { allowInternal: true });
  if (error) return error;

  // For internal auth, the account ID comes from the x-account-id header
  const accountId =
    auth.auth_method === "internal"
      ? request.headers.get("x-account-id")
      : auth.account_id;

  if (!accountId) {
    return apiError("Missing account ID", 400);
  }

  try {
    const result = await syncGmailReplies(accountId);
    return apiSuccess(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during Gmail sync";
    console.error("[inbox/sync] Error:", message);
    return apiError(message, 500);
  }
}
