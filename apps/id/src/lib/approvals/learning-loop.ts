import { createAdminClient } from "@/lib/supabase/admin";
import type { ApprovalRecord, ApprovalAction } from "./types";
import { calibrateThreshold } from "./threshold";
import { analyzeEdits } from "./edit-analyzer";
import { emitApprovalEvent } from "./events";

/**
 * Process a user's approval decision.
 * Updates the approval record, calibrates thresholds, analyzes edits, and logs to Ledger.
 */
export async function processApprovalDecision(
  approval: ApprovalRecord,
  action: ApprovalAction
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (action.action === "approve") {
    const hasEdits = action.edits !== null && Object.keys(action.edits).length > 0;

    // Update approval record
    const updates: Record<string, unknown> = {
      status: "approved",
      acted_at: now,
    };

    if (hasEdits) {
      updates.user_edits = action.edits;
    }

    // Analyze edits if present
    let editClassifications = null;
    if (hasEdits && action.edits) {
      editClassifications = await analyzeEdits(
        approval.preview.content,
        action.edits,
        approval
      );
      updates.edit_classification = editClassifications;

      // Generate Proposals for systematic edit patterns
      const proposalEdits = editClassifications.filter((e) => e.proposal_generated);
      if (proposalEdits.length > 0) {
        await generateProposals(admin, approval, proposalEdits);
      }
    }

    const { error: updateError } = await admin
      .from("kinetiks_approvals")
      .update(updates)
      .eq("id", approval.id);

    if (updateError) {
      throw new Error(`Failed to update approval: ${updateError.message}`);
    }

    // Calibrate threshold
    const calibrationEvent = hasEdits ? "approved_with_edits" : "approved_clean";
    await calibrateThreshold(
      approval.account_id,
      approval.action_category,
      calibrationEvent as "approved_clean" | "approved_with_edits"
    );

    // Log to Ledger
    await admin.from("kinetiks_ledger").insert({
      account_id: approval.account_id,
      event_type: hasEdits ? "approval_approved_with_edits" : "approval_approved",
      source_app: approval.source_app,
      target_layer: null,
      detail: {
        approval_id: approval.id,
        approval_type: approval.approval_type,
        edits: action.edits,
        edit_classification: editClassifications,
      },
      source_operator: "approval_system",
    });

    // Emit event
    await emitApprovalEvent(
      hasEdits ? "approval_approved_with_edits" : "approval_approved",
      approval.id,
      approval.account_id,
      approval.action_category,
      { edits: action.edits, edit_classification: editClassifications }
    );
  } else if (action.action === "reject") {
    // Update approval record
    await admin
      .from("kinetiks_approvals")
      .update({
        status: "rejected",
        rejection_reason: action.rejection_reason,
        acted_at: now,
      })
      .eq("id", approval.id);

    // Calibrate threshold (trust contraction)
    await calibrateThreshold(
      approval.account_id,
      approval.action_category,
      "rejected"
    );

    // Log to Ledger
    await admin.from("kinetiks_ledger").insert({
      account_id: approval.account_id,
      event_type: "approval_rejected",
      source_app: approval.source_app,
      target_layer: null,
      detail: {
        approval_id: approval.id,
        approval_type: approval.approval_type,
        rejection_reason: action.rejection_reason,
      },
      source_operator: "approval_system",
    });

    // Emit event
    await emitApprovalEvent(
      "approval_rejected",
      approval.id,
      approval.account_id,
      approval.action_category,
      { rejection_reason: action.rejection_reason }
    );
  }
}

/**
 * Flag a previously approved/auto-approved action as wrong.
 * Triggers trust contraction.
 */
export async function flagApproval(
  approvalId: string,
  accountId: string,
  reason: string
): Promise<void> {
  const admin = createAdminClient();

  const { data: approval } = await admin
    .from("kinetiks_approvals")
    .select("*")
    .eq("id", approvalId)
    .eq("account_id", accountId)
    .single();

  if (!approval) throw new Error("Approval not found");

  const record = approval as ApprovalRecord;

  if (record.status !== "approved" && record.status !== "auto_approved") {
    throw new Error("Can only flag approved or auto-approved items");
  }

  await admin
    .from("kinetiks_approvals")
    .update({
      status: "flagged",
      rejection_reason: reason,
      acted_at: new Date().toISOString(),
    })
    .eq("id", approvalId);

  // Trust contraction - treat as rejection
  await calibrateThreshold(accountId, record.action_category, "rejected");

  // Log to Ledger
  await admin.from("kinetiks_ledger").insert({
    account_id: accountId,
    event_type: "approval_flagged",
    source_app: record.source_app,
    target_layer: null,
    data: {
      approval_id: approvalId,
      original_status: record.status,
      flag_reason: reason,
    },
    attribution: "user",
  });

  await emitApprovalEvent(
    "approval_flagged",
    approvalId,
    accountId,
    record.action_category,
    { reason }
  );
}

async function generateProposals(
  admin: ReturnType<typeof createAdminClient>,
  approval: ApprovalRecord,
  edits: { edit_type: string; description: string; field_path: string }[]
): Promise<void> {
  // Map edit types to target layers
  const layerMap: Record<string, string> = {
    tone_adjustment: "voice",
    factual_correction: "org",
    targeting_adjustment: "customers",
  };

  for (const edit of edits) {
    const targetLayer = layerMap[edit.edit_type];
    if (!targetLayer) continue;

    await admin.from("kinetiks_proposals").insert({
      account_id: approval.account_id,
      source_app: approval.source_app,
      source_operator: "edit_analyzer",
      action: "update",
      target_layer: targetLayer,
      payload: {
        source: "edit_analysis",
        edit_type: edit.edit_type,
        description: edit.description,
        field_path: edit.field_path,
        from_approval: approval.id,
        reasoning: `User consistently makes ${edit.edit_type} edits in ${approval.action_category} actions. This suggests the ${targetLayer} layer needs updating.`,
      },
      confidence: "inferred",
      evidence: [{ type: "edit_pattern", approval_id: approval.id }],
      status: "submitted",
    });
  }
}
