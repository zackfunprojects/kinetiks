import { createAdminClient } from "@/lib/supabase/admin";
import { resolveProposal } from "@kinetiks/cortex";
import type { ApprovalRecord, ApprovalAction } from "./types";
import type { ContextLayer, GrantProposalEnvelopeMember } from "@kinetiks/types";
import { calibrateThreshold } from "./threshold";
import { analyzeEdits } from "./edit-analyzer";
import { emitApprovalEvent } from "./events";
import { emitInsight } from "@/lib/insights";
import {
  applyAuthorityGrantApprove,
  applyAuthorityGrantReject,
} from "./authority-grant";

/**
 * For context_edit approvals, resolve the linked Proposal so the merge
 * actually applies to `kinetiks_context_{layer}`. Auto-approved cases
 * applied the merge directly via `submitContextEditProposal` →
 * `evaluateProposal`; this path handles the user-clicks-approve case
 * for escalated proposals.
 */
async function applyContextEditApproval(
  admin: ReturnType<typeof createAdminClient>,
  approval: ApprovalRecord,
  decision: "accept" | "decline",
  declineReason?: string,
): Promise<{ layer: ContextLayer; proposalId: string; applied: boolean }> {
  const content = approval.preview.content as Record<string, unknown>;
  const proposalId = content.proposal_id as string | undefined;
  const layer = content.layer as ContextLayer | undefined;
  if (!proposalId || !layer) {
    throw new Error("context_edit approval missing proposal_id/layer in preview");
  }
  const result = await resolveProposal(
    admin,
    approval.account_id,
    proposalId,
    decision,
    "approval_system",
    declineReason,
  );
  return {
    layer,
    proposalId,
    applied: result.status === "accepted" && result.mergeSuccess !== false,
  };
}

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

  // Phase 4 — Chunk 7: authority_grant_proposal approvals carry a
  // distinct side-effect chain (grant lifecycle transition + authority
  // ledger events + optional successor-grant proposal via RPC on
  // edit-and-approve). Delegate to the dedicated handler; do NOT run
  // the brand/quality/threshold logic which doesn't apply here.
  //
  // The standard approval row update + standard approval Ledger entry
  // still fire below for the audit trail, so the customer's approval
  // queue shows the action as approved/rejected normally; the
  // authority handler is purely the lifecycle side-effect.
  const approvalClass = (
    approval as ApprovalRecord & { approval_class?: string }
  ).approval_class;
  if (approvalClass === "authority_grant_proposal") {
    if (action.action === "approve") {
      const edits =
        action.edits && (action.edits as { grant?: unknown }).grant
          ? {
              grant: (action.edits as { grant: GrantProposalEnvelopeMember["grant"] })
                .grant,
            }
          : null;
      await applyAuthorityGrantApprove(admin, approval, { edits });
    } else {
      await applyAuthorityGrantReject(admin, approval, {
        rejection_reason: action.rejection_reason ?? "user_rejected",
      });
    }
    // Always update the approval row's status + acted_at so the
    // queue surface mirrors the lifecycle outcome.
    const updates =
      action.action === "approve"
        ? { status: "approved", acted_at: now }
        : {
            status: "rejected",
            rejection_reason: action.rejection_reason,
            acted_at: now,
          };
    const { error: updateErr } = await admin
      .from("kinetiks_approvals")
      .update(updates)
      .eq("id", approval.id);
    if (updateErr) {
      throw new Error(
        `Failed to update authority_grant_proposal approval: ${updateErr.message}`,
      );
    }
    // Emit the standard approval event so dashboards / activity
    // surfaces pick it up alongside other approvals.
    await emitApprovalEvent(
      action.action === "approve" ? "approval_approved" : "approval_rejected",
      approval.id,
      approval.account_id,
      approval.action_category,
      { approval_class: "authority_grant_proposal" },
    );
    return;
  }

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

    // If this is a context_edit approval, apply the linked Proposal now.
    let contextEditApplied: { layer: ContextLayer; proposalId: string; applied: boolean } | null = null;
    if (approval.preview?.type === "context_edit") {
      try {
        contextEditApplied = await applyContextEditApproval(admin, approval, "accept");
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[approvals] failed to apply context_edit on approve", e);
      }
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
        context_edit: contextEditApplied,
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

    // Emit Insight — captures the approval outcome for Analytics surfacing.
    void emitInsight(admin, {
      account_id: approval.account_id,
      type: contextEditApplied ? "identity_update" : "approval_outcome",
      severity: "info",
      summary: contextEditApplied
        ? `Approved ${contextEditApplied.layer} layer edit (${contextEditApplied.applied ? "applied" : "queued"}).`
        : `Approved: ${approval.title}.`,
      evidence: {
        approval_id: approval.id,
        approval_type: approval.approval_type,
        action_category: approval.action_category,
        had_edits: hasEdits,
        ...(contextEditApplied
          ? { layer: contextEditApplied.layer, proposal_id: contextEditApplied.proposalId }
          : {}),
      },
      source_app: approval.source_app,
      source_operator: "approval_system",
      approval_id: approval.id,
      proposal_id: contextEditApplied?.proposalId,
    });
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

    // If this is a context_edit approval, mark the linked Proposal as declined.
    let contextEditDeclined: { layer: ContextLayer; proposalId: string } | null = null;
    if (approval.preview?.type === "context_edit") {
      try {
        const result = await applyContextEditApproval(
          admin,
          approval,
          "decline",
          action.rejection_reason ?? "user_rejected",
        );
        contextEditDeclined = { layer: result.layer, proposalId: result.proposalId };
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[approvals] failed to decline context_edit on reject", e);
      }
    }

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
        context_edit_declined: contextEditDeclined,
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

    // Emit Insight — rejections are notable signal (trust contraction).
    void emitInsight(admin, {
      account_id: approval.account_id,
      type: "approval_outcome",
      severity: "notable",
      summary: `Rejected: ${approval.title}${action.rejection_reason ? ` (${action.rejection_reason.slice(0, 80)})` : ""}.`,
      evidence: {
        approval_id: approval.id,
        approval_type: approval.approval_type,
        action_category: approval.action_category,
        ...(contextEditDeclined
          ? { layer: contextEditDeclined.layer, proposal_id: contextEditDeclined.proposalId }
          : {}),
      },
      source_app: approval.source_app,
      source_operator: "approval_system",
      approval_id: approval.id,
      proposal_id: contextEditDeclined?.proposalId,
    });
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
