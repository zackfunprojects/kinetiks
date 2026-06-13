/**
 * Apply changes to the live role→model mapping (kinetiks_model_assignments)
 * and record proposal decisions. The execute side of the adaptive model
 * loop, now driven by the admin panel rather than the customer Approval
 * queue.
 *
 * Authorization is the caller's responsibility (the admin server actions
 * call requireAdmin first); these functions assume an authorized admin
 * and just do the data work. They take the admin's auth.users id for the
 * assignment's `approved_by` provenance.
 *
 * Audit trail is the dedicated platform tables — kinetiks_model_flip_proposals
 * (status, decided_at, reject_reason) and kinetiks_model_assignments
 * (approved_by, source, updated_at) — NOT the account-scoped customer
 * Learning Ledger, which a deployment-wide model change doesn't belong in.
 *
 * On a successful assignment change the in-memory resolver snapshot is
 * refreshed so the new model takes effect on the next Claude call.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ROLE_FAMILY, type ModelRole, type ModelFamily } from "@kinetiks/ai";

import { createAdminClient } from "@/lib/supabase/admin";
import { refreshModelAssignments } from "./model-assignment-reader";

export interface FlipApplyResult {
  ok: boolean;
  error?: string;
}

interface PendingProposal {
  id: string;
  role: ModelRole;
  to_model: string;
  family: ModelFamily;
  released_at: string | null;
  status: string;
}

function admin(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

/** Approve a pending flip: point the role at the proposal's to_model. */
export async function applyModelFlip(
  proposalId: string,
  adminUserId: string,
): Promise<FlipApplyResult> {
  const db = admin();
  const { data, error } = await db
    .from("kinetiks_model_flip_proposals")
    .select("id, role, to_model, family, released_at, status")
    .eq("id", proposalId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  const p = data as PendingProposal | null;
  if (!p) return { ok: false, error: "proposal not found" };
  if (p.status !== "pending") return { ok: false, error: `proposal already ${p.status}` };

  const now = new Date().toISOString();
  const { error: assignErr } = await db
    .from("kinetiks_model_assignments")
    .update({
      assigned_model_id: p.to_model,
      family: p.family,
      source: "discovery_approved",
      approved_by: adminUserId,
      released_at: p.released_at,
      updated_at: now,
    })
    .eq("role", p.role);
  if (assignErr) return { ok: false, error: `assignment update failed: ${assignErr.message}` };

  const { error: propErr } = await db
    .from("kinetiks_model_flip_proposals")
    .update({ status: "approved", decided_at: now })
    .eq("id", proposalId)
    .eq("status", "pending"); // concurrency guard: only the first decision wins
  if (propErr) return { ok: false, error: `proposal update failed: ${propErr.message}` };

  await refreshModelAssignments();
  return { ok: true };
}

/** Reject a pending flip (seeds the discovery cooldown via the reject row). */
export async function recordFlipRejection(
  proposalId: string,
  reason: string | null,
): Promise<FlipApplyResult> {
  const db = admin();
  const { error } = await db
    .from("kinetiks_model_flip_proposals")
    .update({ status: "rejected", decided_at: new Date().toISOString(), reject_reason: reason })
    .eq("id", proposalId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Directly set a role's model (admin override, outside the proposal flow). */
export async function overrideRoleModel(
  role: ModelRole,
  modelId: string,
  family: ModelFamily,
  adminUserId: string,
): Promise<FlipApplyResult> {
  if (ROLE_FAMILY[role] !== family) {
    return { ok: false, error: `family ${family} does not match role ${role}` };
  }
  const db = admin();
  const { error } = await db
    .from("kinetiks_model_assignments")
    .update({
      assigned_model_id: modelId,
      family,
      source: "admin_override",
      approved_by: adminUserId,
      released_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("role", role);
  if (error) return { ok: false, error: error.message };
  await refreshModelAssignments();
  return { ok: true };
}

/** Freeze / unfreeze a role (frozen roles are skipped by discovery). */
export async function setRoleFrozen(
  role: ModelRole,
  frozen: boolean,
): Promise<FlipApplyResult> {
  const db = admin();
  const { error } = await db
    .from("kinetiks_model_assignments")
    .update({ frozen, updated_at: new Date().toISOString() })
    .eq("role", role);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
