import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { flagApproval } from "@/lib/approvals/learning-loop";

/**
 * POST /api/approvals/flag
 * Flag a previously approved/auto-approved action as wrong.
 * Body: { approval_id: string, reason: string }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: { approval_id: string; reason: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.approval_id || !body.reason) {
    return apiError("Missing required fields: approval_id, reason", 400);
  }

  try {
    await flagApproval(body.approval_id, auth.account_id, body.reason);
    return apiSuccess({ flagged: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Flag failed";
    return apiError(message, 500);
  }
}
