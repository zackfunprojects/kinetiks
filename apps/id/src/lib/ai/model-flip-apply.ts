/**
 * Apply changes to the live role→model mapping (kinetiks_model_assignments)
 * and record proposal decisions. The execute side of the adaptive model
 * loop, driven by the admin panel.
 *
 * Authorization is the caller's responsibility (the admin server actions
 * call requireAdmin first); these functions assume an authorized admin and
 * take the admin's auth.users id for the assignment's `approved_by`.
 *
 * Audit trail is the dedicated platform tables — kinetiks_model_flip_proposals
 * (status, decided_at, reject_reason) and kinetiks_model_assignments
 * (approved_by, source, updated_at) — NOT the account-scoped customer
 * Learning Ledger, which a deployment-wide model change doesn't belong in.
 *
 * Errors: raw PostgREST messages never reach the caller (they would surface
 * in the admin UI). DB failures are captured to Sentry and returned as a
 * generic user-safe message; user-meaningful states (not-found,
 * already-decided, family-mismatch) are returned as plain sentences.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ROLE_FAMILY, type ModelRole, type ModelFamily } from "@kinetiks/ai";

import { createAdminClient } from "@/lib/supabase/admin";
import { captureException, USER_SAFE } from "@/lib/observability/sentry";
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

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

/** Capture a DB failure (raw detail to Sentry) and return a safe message. */
async function dbFailure(stage: string, message: string): Promise<FlipApplyResult> {
  await captureException(new Error(`model-flip-apply ${stage}: ${message}`), {
    tags: { route: "admin/models", action: "model_flip_apply", stage, app: "id" },
    extra: {},
  });
  return { ok: false, error: USER_SAFE.GENERIC_ERROR };
}

/** Approve a pending flip: point the role at the proposal's to_model. */
export async function applyModelFlip(
  proposalId: string,
  adminUserId: string,
): Promise<FlipApplyResult> {
  const client = db();
  const { data, error } = await client
    .from("kinetiks_model_flip_proposals")
    .select("id, role, to_model, family, released_at, status")
    .eq("id", proposalId)
    .maybeSingle();
  if (error) return dbFailure("read", error.message);
  const p = data as PendingProposal | null;
  if (!p) return { ok: false, error: "Proposal not found." };
  if (p.status !== "pending") return { ok: false, error: `This proposal was already ${p.status}.` };

  const now = new Date().toISOString();

  // Claim the proposal FIRST as the atomic gate: the guarded transition
  // (only WHERE status='pending') means a concurrent reject can't slip in
  // between the assignment write and the status change. Only the decision
  // that claims the row proceeds to touch the mapping.
  const { data: claimed, error: claimErr } = await client
    .from("kinetiks_model_flip_proposals")
    .update({ status: "approved", decided_at: now })
    .eq("id", proposalId)
    .eq("status", "pending")
    .select("id");
  if (claimErr) return dbFailure("claim", claimErr.message);
  if (!claimed || (claimed as unknown[]).length === 0) {
    return { ok: false, error: "This proposal was just decided by someone else." };
  }

  // Apply the assignment. If this fails after the claim, the proposal is
  // 'approved' but the mapping is unchanged — recoverable via Override, and
  // far safer than flipping the model under a concurrently-rejected proposal.
  const { error: assignErr } = await client
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
  if (assignErr) return dbFailure("assignment", assignErr.message);

  await refreshModelAssignments();
  return { ok: true };
}

/** Reject a pending flip (seeds the discovery cooldown via the reject row). */
export async function recordFlipRejection(
  proposalId: string,
  reason: string | null,
): Promise<FlipApplyResult> {
  const { error } = await db()
    .from("kinetiks_model_flip_proposals")
    .update({ status: "rejected", decided_at: new Date().toISOString(), reject_reason: reason })
    .eq("id", proposalId)
    .eq("status", "pending");
  if (error) return dbFailure("reject", error.message);
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
    return { ok: false, error: `Family ${family} does not match role ${role}.` };
  }
  const { error } = await db()
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
  if (error) return dbFailure("override", error.message);
  await refreshModelAssignments();
  return { ok: true };
}

/** Freeze / unfreeze a role (frozen roles are skipped by discovery). */
export async function setRoleFrozen(
  role: ModelRole,
  frozen: boolean,
): Promise<FlipApplyResult> {
  const { error } = await db()
    .from("kinetiks_model_assignments")
    .update({ frozen, updated_at: new Date().toISOString() })
    .eq("role", role);
  if (error) return dbFailure("freeze", error.message);
  return { ok: true };
}
