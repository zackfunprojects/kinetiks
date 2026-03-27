import { createAdminClient } from "@/lib/supabase/admin";
import { recordDecision } from "./modes";

interface ApprovalRow {
  id: string;
  kinetiks_id: string;
  operator: string;
  function_name: string;
  type: string;
  context: Record<string, unknown>;
  status: string;
  resolved_by: string | null;
  resolved_at: string | null;
  expires_at: string | null;
  priority: string;
  created_at: string;
}

/**
 * Create a new approval request.
 *
 * Inserts a pending approval into hv_approvals with a 24-hour expiration.
 * Returns the approval ID for tracking.
 */
export async function createApproval(
  accountId: string,
  operator: string,
  functionName: string,
  action: string,
  context: Record<string, unknown>
): Promise<string> {
  const admin = createAdminClient();

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("hv_approvals")
    .insert({
      kinetiks_id: accountId,
      app: "harvest",
      operator,
      function_name: functionName,
      type: action,
      context,
      status: "pending",
      expires_at: expiresAt,
      priority: "standard",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[approvals] Failed to create approval:", error.message);
    throw new Error(`Failed to create approval: ${error.message}`);
  }

  return (data as { id: string }).id;
}

/**
 * Resolve a pending approval (accept or decline).
 *
 * Updates the approval status and records the decision in the
 * operator confidence table to track agreement rates.
 */
export async function resolveApproval(
  approvalId: string,
  accountId: string,
  decision: "accept" | "decline",
  resolvedBy: string
): Promise<void> {
  const admin = createAdminClient();

  // Load the approval to get operator/function_name for decision recording
  const { data: approval, error: fetchError } = await admin
    .from("hv_approvals")
    .select("id, kinetiks_id, operator, function_name, status, expires_at")
    .eq("id", approvalId)
    .eq("kinetiks_id", accountId)
    .single();

  if (fetchError || !approval) {
    throw new Error("Approval not found");
  }

  const typedApproval = approval as ApprovalRow;

  // Verify the approval is still pending
  if (typedApproval.status !== "pending") {
    throw new Error(`Approval already resolved with status: ${typedApproval.status}`);
  }

  // Check if expired
  if (typedApproval.expires_at && new Date(typedApproval.expires_at) < new Date()) {
    // Mark as expired
    await admin
      .from("hv_approvals")
      .update({
        status: "expired",
        updated_at: new Date().toISOString(),
      })
      .eq("id", approvalId);
    throw new Error("Approval has expired");
  }

  // Update the approval status
  const newStatus = decision === "accept" ? "accepted" : "declined";
  const { error: updateError } = await admin
    .from("hv_approvals")
    .update({
      status: newStatus,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", approvalId);

  if (updateError) {
    console.error("[approvals] Failed to update approval:", updateError.message);
    throw new Error(`Failed to resolve approval: ${updateError.message}`);
  }

  // Record the decision in confidence tracking
  // "accept" means the user agreed with the operator's suggestion
  const agreed = decision === "accept";
  await recordDecision(
    accountId,
    typedApproval.operator,
    typedApproval.function_name,
    agreed
  );
}

/**
 * List pending approvals for an account, excluding expired ones.
 */
export async function listPendingApprovals(
  accountId: string
): Promise<ApprovalRow[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("hv_approvals")
    .select("*")
    .eq("kinetiks_id", accountId)
    .eq("status", "pending")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[approvals] Failed to list approvals:", error.message);
    throw new Error(`Failed to list approvals: ${error.message}`);
  }

  return (data ?? []) as ApprovalRow[];
}
