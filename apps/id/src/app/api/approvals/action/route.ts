import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { processApprovalDecision } from "@/lib/approvals/learning-loop";
import type { ApprovalAction, ApprovalRecord } from "@/lib/approvals/types";

/**
 * POST /api/approvals/action
 * User approves or rejects an approval.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: ApprovalAction;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.approval_id || !body.action) {
    return apiError("Missing required fields: approval_id, action", 400);
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return apiError("Action must be 'approve' or 'reject'", 400);
  }

  if (body.action === "reject" && !body.rejection_reason) {
    return apiError("Rejection reason is required", 400);
  }

  const admin = createAdminClient();

  // Fetch the approval
  const { data: approval } = await admin
    .from("kinetiks_approvals")
    .select("*")
    .eq("id", body.approval_id)
    .eq("account_id", auth.account_id)
    .single();

  if (!approval) {
    return apiError("Approval not found", 404);
  }

  const record = approval as ApprovalRecord;

  if (record.status !== "pending") {
    return apiError(`Cannot act on approval with status '${record.status}'`, 400);
  }

  try {
    await processApprovalDecision(record, body);

    // Fetch updated record
    const { data: updated } = await admin
      .from("kinetiks_approvals")
      .select("*")
      .eq("id", body.approval_id)
      .single();

    return apiSuccess(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing error";
    return apiError(message, 500);
  }
}
