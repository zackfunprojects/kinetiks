import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContextLayer, Proposal } from "@kinetiks/types";
import { recalculateConfidence } from "./confidence";
import { validateLayerData } from "@/lib/utils/context-validator";
import { dispatchEvent } from "@/lib/webhooks/deliver";

export interface ResolveResult {
  proposal_id: string;
  status: "accepted" | "declined";
  error?: string;
}

/**
 * Resolve an escalated proposal by accepting or declining it.
 * Handles: status update, data merge (on accept), confidence recalc, ledger logging.
 *
 * Shared by: /api/cortex/evaluate PATCH and /api/approvals POST
 */
export async function resolveProposal(
  admin: SupabaseClient,
  accountId: string,
  proposalId: string,
  decision: "accept" | "decline",
  resolvedBy: string,
  declineReason?: string
): Promise<ResolveResult> {
  // Fetch the proposal
  const { data: proposal, error: fetchError } = await admin
    .from("kinetiks_proposals")
    .select("*")
    .eq("id", proposalId)
    .eq("account_id", accountId)
    .eq("status", "escalated")
    .single();

  if (fetchError || !proposal) {
    return { proposal_id: proposalId, status: "declined", error: "Escalated proposal not found" };
  }

  const newStatus = decision === "accept" ? "accepted" : "declined";

  // Update proposal status
  const { error: updateError } = await admin
    .from("kinetiks_proposals")
    .update({
      status: newStatus,
      evaluated_at: new Date().toISOString(),
      evaluated_by: resolvedBy,
      ...(decision === "decline"
        ? { decline_reason: declineReason ?? "user_dismissed" }
        : {}),
    })
    .eq("id", proposalId);

  if (updateError) {
    console.error(`Failed to update proposal ${proposalId}:`, updateError.message);
    return { proposal_id: proposalId, status: "declined", error: "Failed to update proposal status" };
  }

  if (decision === "accept") {
    const typedProposal = proposal as unknown as Proposal;
    const tableName = `kinetiks_context_${typedProposal.target_layer}`;

    const { data: existingRow, error: selectError } = await admin
      .from(tableName)
      .select("data")
      .eq("account_id", accountId)
      .maybeSingle();

    if (selectError) {
      console.error(`Failed to read ${tableName}:`, selectError.message);
      return { proposal_id: proposalId, status: "accepted", error: "Accepted but failed to merge data" };
    }

    const existingData = (existingRow?.data as Record<string, unknown>) || {};
    const mergedData = { ...existingData, ...typedProposal.payload };

    const validation = validateLayerData(
      typedProposal.target_layer as ContextLayer,
      mergedData
    );

    if (validation.valid) {
      const { error: upsertError } = await admin
        .from(tableName)
        .upsert(
          {
            account_id: accountId,
            data: mergedData,
            source: "user_explicit",
            source_detail: "escalated_proposal_accepted",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "account_id" }
        );

      if (upsertError) {
        console.error(`Failed to upsert ${tableName}:`, upsertError.message);
      }
    } else {
      console.error(`Merged data failed validation for ${typedProposal.target_layer}:`, validation.errors);
    }

    try {
      await recalculateConfidence(admin, accountId);
    } catch (e) {
      console.error(`Confidence recalculation failed:`, e);
    }
  }

  // Log to ledger
  const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
    account_id: accountId,
    event_type: decision === "accept" ? "proposal_accepted" : "proposal_declined",
    source_app: proposal.source_app,
    source_operator: proposal.source_operator,
    target_layer: proposal.target_layer,
    detail: {
      proposal_id: proposalId,
      decision,
      evaluated_by: resolvedBy,
      payload_summary: Object.keys(proposal.payload as Record<string, unknown>),
    },
  });

  if (ledgerError) {
    console.error(`Ledger insert failed for proposal ${proposalId}:`, ledgerError.message);
  }

  if (decision === "accept") {
    dispatchEvent(accountId, "proposal.accepted", {
      proposal_id: proposalId,
      target_layer: proposal.target_layer,
      source_app: proposal.source_app,
    });
  } else {
    dispatchEvent(accountId, "proposal.declined", {
      proposal_id: proposalId,
      target_layer: proposal.target_layer,
      source_app: proposal.source_app,
      reason: declineReason ?? "user_dismissed",
    });
  }

  return { proposal_id: proposalId, status: newStatus };
}
