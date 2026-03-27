import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { listPendingApprovals, resolveApproval } from "@/lib/automations/approvals";

/**
 * GET /api/hv/approvals
 * List pending approvals for the authenticated account.
 * Returns only non-expired pending approvals.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  try {
    const approvals = await listPendingApprovals(auth.account_id);
    return apiSuccess(approvals);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error listing approvals";
    console.error("[approvals API] GET error:", message);
    return apiError(message, 500);
  }
}

/**
 * POST /api/hv/approvals
 * Resolve a pending approval (accept or decline).
 *
 * Body: { approval_id: string, decision: "accept" | "decline" }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const approvalId = body.approval_id;
  const decision = body.decision;

  if (typeof approvalId !== "string" || approvalId.length === 0) {
    return apiError("Missing or invalid approval_id", 400);
  }

  if (decision !== "accept" && decision !== "decline") {
    return apiError("decision must be 'accept' or 'decline'", 400);
  }

  try {
    await resolveApproval(
      approvalId,
      auth.account_id,
      decision,
      auth.auth_method === "api_key" ? "api_key" : "user"
    );
    return apiSuccess({ resolved: true, approval_id: approvalId, decision });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error resolving approval";
    console.error("[approvals API] POST error:", message);

    // Return 404 for "not found" errors, 409 for already resolved, 410 for expired
    if (message === "Approval not found") {
      return apiError(message, 404);
    }
    if (message.startsWith("Approval already resolved")) {
      return apiError(message, 409);
    }
    if (message === "Approval has expired") {
      return apiError(message, 410);
    }

    return apiError(message, 500);
  }
}
