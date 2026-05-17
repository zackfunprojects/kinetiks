import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContextLayer, Proposal } from "@kinetiks/types";
import { evaluateProposal } from "@kinetiks/cortex";
import { processApproval } from "@/lib/approvals/pipeline";
import { validateLayerData, recalculateConfidence } from "@/lib/cortex";
import { emitInsight } from "@/lib/insights";

/**
 * Per CLAUDE.md v3 §6 ownership hierarchy: user_explicit > user_implicit >
 * validated > inferred > speculative. A direct Cortex Identity edit is
 * user_explicit — the highest authority — but it still flows through the
 * Proposal pipeline so:
 *   - Schema + conflict detection runs (catches the rare case where the
 *     user's edit collides with a recently validated system entry).
 *   - The Approval system records an audit card (auto_approved for
 *     user-explicit edits with no conflicts).
 *   - An Insight is emitted so the change shows in Analytics.
 *
 * This is the canonical path for /api/context/[layer] PUT/PATCH. Direct
 * upserts to `kinetiks_context_*` from feature code are forbidden.
 */

export type ContextEditOutcome = "auto_applied" | "escalated" | "declined";

export interface SubmitContextEditOptions {
  /** Free-form caller label, defaults to "kinetiks_id". */
  source_app?: string;
  /** Required: the operator-facing identifier (e.g. "cortex_identity_editor"). */
  source_operator: string;
  /** Fields the user touched in this edit; used in evidence + insight. */
  fields_updated: string[];
  /** Stringified content length used by the approval classifier. */
  content_length?: number;
  /** Whether the layer is considered strategic (alters business direction). */
  changes_strategy?: boolean;
  /** Whether the edit affects multiple downstream outputs (voice/narrative). */
  affects_multiple_outputs?: boolean;
}

export interface SubmitContextEditResult {
  proposal_id: string;
  approval_id: string;
  approval_status: "auto_approved" | "pending";
  outcome: ContextEditOutcome;
  /** New aggregate confidence for the layer after the merge (only when auto_applied). */
  layer_confidence?: number;
  /** Decline reason when outcome === "declined". */
  decline_reason?: string;
}

export async function submitContextEditProposal(
  admin: SupabaseClient,
  accountId: string,
  layer: ContextLayer,
  newData: Record<string, unknown>,
  options: SubmitContextEditOptions,
): Promise<SubmitContextEditResult> {
  // Defensive: validate payload shape before paying the proposal cost
  const validation = validateLayerData(layer, newData);
  if (!validation.valid) {
    throw new Error(
      `Invalid data for layer ${layer}: ${(validation.errors ?? []).join(", ")}`,
    );
  }

  // ── 1. Insert the Proposal (status = "submitted") ─────────────
  const { data: proposal, error: proposalError } = await admin
    .from("kinetiks_proposals")
    .insert({
      account_id: accountId,
      source_app: options.source_app ?? "kinetiks_id",
      source_operator: options.source_operator,
      target_layer: layer,
      action: "update",
      confidence: "validated", // user-explicit edits are validated-tier evidence
      payload: newData,
      evidence: [
        {
          type: "user_action",
          value: `Edited ${options.fields_updated.length} field(s) in ${layer}`,
          context: `Operator: ${options.source_operator}`,
          date: new Date().toISOString(),
        },
      ],
    })
    .select("*")
    .single();

  if (proposalError || !proposal) {
    throw new Error(
      `Failed to insert proposal: ${proposalError?.message ?? "unknown error"}`,
    );
  }

  const proposalRow = proposal as unknown as Proposal;

  // ── 2. Submit Approval card (audit + gating) ───────────────────
  const isStrategic =
    options.changes_strategy ?? (layer === "org" || layer === "products");
  const affectsMultiple =
    options.affects_multiple_outputs ??
    (layer === "voice" || layer === "narrative" || layer === "brand");

  const action_category =
    isStrategic ? "context_update_major" : "context_update_minor";

  const approvalResult = await processApproval(
    {
      source_app: options.source_app ?? "kinetiks_id",
      source_operator: options.source_operator,
      action_category,
      title: `Update ${layer} layer`,
      description: `User edit: ${options.fields_updated.join(", ")}`,
      preview: {
        type: "context_edit",
        content: {
          proposal_id: proposalRow.id,
          layer,
          fields_updated: options.fields_updated,
          new_data: newData,
        },
      },
      deep_link: `/cortex/identity/${layer}`,
      agent_confidence: 95, // user-explicit edits are high-trust
      changes_strategy: isStrategic,
      affects_multiple_outputs: affectsMultiple,
      content_length: options.content_length ?? JSON.stringify(newData).length,
      expires_in_hours: 7 * 24, // strategic-window default; trigger sweeps these
    },
    accountId,
  );

  // ── 3. Evaluate the proposal (merge / conflict / route) ───────
  // For user-explicit edits this normally returns "accepted" and writes
  // the merge into `kinetiks_context_{layer}`. If conflict detection
  // escalates, the proposal sits in "escalated" status and the approval
  // card surfaces in the queue for the user to confirm.
  const evaluation = await evaluateProposal(admin, proposalRow);

  // ── 4. Emit Insight ────────────────────────────────────────────
  let layerConfidence: number | undefined;
  if (evaluation.status === "accepted") {
    try {
      const confidence = await recalculateConfidence(admin, accountId);
      layerConfidence = confidence[layer];
    } catch (e) {
      // Confidence recalc failure is non-fatal — the merge already happened.
      // eslint-disable-next-line no-console
      console.warn("[submit-context-edit] confidence recalc failed", e);
    }
  }

  void emitInsight(admin, {
    account_id: accountId,
    type: "identity_update",
    severity: evaluation.status === "accepted" ? "info" : "notable",
    summary: insightSummary(layer, evaluation.status, options.fields_updated, layerConfidence),
    evidence: {
      layer,
      fields_updated: options.fields_updated,
      proposal_status: evaluation.status,
      decline_reason: evaluation.decline_reason ?? undefined,
      layer_confidence: layerConfidence,
    },
    source_app: options.source_app ?? "kinetiks_id",
    source_operator: options.source_operator,
    proposal_id: proposalRow.id,
    approval_id: approvalResult.approval_id,
  });

  // ── 5. Return outcome ──────────────────────────────────────────
  const outcome: ContextEditOutcome =
    evaluation.status === "accepted"
      ? "auto_applied"
      : evaluation.status === "escalated"
        ? "escalated"
        : "declined";

  return {
    proposal_id: proposalRow.id,
    approval_id: approvalResult.approval_id,
    approval_status: approvalResult.auto_approved ? "auto_approved" : "pending",
    outcome,
    layer_confidence: layerConfidence,
    decline_reason: evaluation.decline_reason ?? undefined,
  };
}

function insightSummary(
  layer: ContextLayer,
  status: string,
  fields: string[],
  layerConfidence?: number,
): string {
  if (status === "accepted") {
    const conf = layerConfidence !== undefined ? ` (${layerConfidence}% confidence)` : "";
    return `Updated ${layer} layer${conf}: ${fields.join(", ")}.`;
  }
  if (status === "escalated") {
    return `${layer} layer edit needs your confirmation: ${fields.join(", ")}.`;
  }
  return `${layer} layer edit was declined: ${fields.join(", ")}.`;
}
