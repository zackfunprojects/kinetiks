/**
 * Apply (or record the rejection of) an operator-approved model flip —
 * the execute side of the adaptive model selection loop.
 *
 * On approve: write the new model id into kinetiks_model_assignments for
 * the role, mark the proposal approved, log Ledger `model_flip_approved`,
 * and refresh the in-memory assignment snapshot so the new model takes
 * effect on the very next Claude call (no deploy, no restart).
 *
 * On reject: mark the proposal rejected with the operator's reason and
 * log `model_flip_rejected`. The reason is calibration signal and the
 * rejection seeds the discovery cooldown (don't re-propose the same
 * (role, to_model) for a window).
 *
 * Both run inside the standard approval decision path (learning-loop),
 * gated to the platform operator account. A failure here does NOT revert
 * the approval record — it is logged and surfaced, mirroring the
 * tool_action executor's posture.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { captureException } from "@/lib/observability/sentry";
import { refreshModelAssignments } from "@/lib/ai/model-assignment-reader";
import type { ApprovalRecord } from "./types";

interface ModelFlipPreview {
  proposal_id: string;
  role: "fast" | "balanced" | "deep";
  from_model: string;
  to_model: string;
  family: "haiku" | "sonnet" | "opus";
  released_at: string | null;
}

function readPreview(approval: ApprovalRecord): ModelFlipPreview | null {
  const c = approval.preview?.content as Record<string, unknown> | undefined;
  if (!c) return null;
  const role = c.role;
  const family = c.family;
  if (
    typeof c.proposal_id !== "string" ||
    typeof c.to_model !== "string" ||
    typeof c.from_model !== "string" ||
    (role !== "fast" && role !== "balanced" && role !== "deep") ||
    (family !== "haiku" && family !== "sonnet" && family !== "opus")
  ) {
    return null;
  }
  return {
    proposal_id: c.proposal_id,
    role,
    family,
    from_model: c.from_model,
    to_model: c.to_model,
    released_at: typeof c.released_at === "string" ? c.released_at : null,
  };
}

/** Apply an approved flip to the live assignment mapping. */
export async function executeModelFlip(approval: ApprovalRecord): Promise<void> {
  const preview = readPreview(approval);
  if (!preview) {
    await captureException(new Error("model_flip approval missing/invalid preview"), {
      tags: { route: "approvals", action: "model_flip_execute", stage: "preview", app: "id" },
      user: { id: approval.account_id },
      extra: { approval_id: approval.id },
    });
    return;
  }

  const admin = createAdminClient() as unknown as SupabaseClient;
  const now = new Date().toISOString();

  try {
    const { error: assignErr } = await admin
      .from("kinetiks_model_assignments")
      .update({
        assigned_model_id: preview.to_model,
        family: preview.family,
        source: "discovery_approved",
        approved_by: approval.account_id,
        released_at: preview.released_at,
        updated_at: now,
      })
      .eq("role", preview.role);
    if (assignErr) throw new Error(`assignment update failed: ${assignErr.message}`);

    await admin
      .from("kinetiks_model_flip_proposals")
      .update({ status: "approved", decided_at: now })
      .eq("id", preview.proposal_id);

    const { error: ledgerErr } = await admin.from("kinetiks_ledger").insert({
      account_id: approval.account_id,
      event_type: "model_flip_approved",
      source_app: "kinetiks_id",
      source_operator: "model_discovery",
      detail: {
        role: preview.role,
        from_model: preview.from_model,
        to_model: preview.to_model,
        family: preview.family,
      },
    });
    if (ledgerErr) throw new Error(`ledger insert failed: ${ledgerErr.message}`);

    // Take effect immediately rather than waiting for the snapshot TTL.
    await refreshModelAssignments();
  } catch (err) {
    await captureException(err, {
      tags: { route: "approvals", action: "model_flip_execute", stage: "apply", app: "id" },
      user: { id: approval.account_id },
      extra: { approval_id: approval.id, proposal_id: preview.proposal_id },
    });
  }
}

/** Record an operator rejection (calibration signal + discovery cooldown). */
export async function rejectModelFlip(
  approval: ApprovalRecord,
  reason: string | null,
): Promise<void> {
  const preview = readPreview(approval);
  if (!preview) return;
  const admin = createAdminClient() as unknown as SupabaseClient;
  const now = new Date().toISOString();
  try {
    await admin
      .from("kinetiks_model_flip_proposals")
      .update({ status: "rejected", decided_at: now, reject_reason: reason })
      .eq("id", preview.proposal_id);
    await admin.from("kinetiks_ledger").insert({
      account_id: approval.account_id,
      event_type: "model_flip_rejected",
      source_app: "kinetiks_id",
      source_operator: "model_discovery",
      detail: {
        role: preview.role,
        from_model: preview.from_model,
        to_model: preview.to_model,
        family: preview.family,
      },
    });
  } catch (err) {
    await captureException(err, {
      tags: { route: "approvals", action: "model_flip_reject", stage: "apply", app: "id" },
      user: { id: approval.account_id },
      extra: { approval_id: approval.id, proposal_id: preview.proposal_id },
    });
  }
}
