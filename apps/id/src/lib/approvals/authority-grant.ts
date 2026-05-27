/**
 * authority_grant_proposal approval handler per Phase 4 — Chunk 7.
 *
 * Three flows:
 *
 *   1. Approve as-proposed — grant transitions proposed → active, ledger
 *      `authority_grant_approved` fires with edits_applied=false.
 *
 *   2. Reject with reason — grant transitions proposed → revoked, ledger
 *      `authority_grant_revoked` fires with revocation_reason carrying
 *      the customer's note.
 *
 *   3. Edit & Approve — customer submits a (partial) replacement grant
 *      payload. The original grant transitions to revoked with reason
 *      `customer_edited`; a NEW proposed grant is inserted via the
 *      same `propose_authority_grants` RPC the Authority Agent used,
 *      with the edits applied. The new approval appears in the queue
 *      and the customer reviews it as a fresh approval. Per the plan,
 *      this is "revoke + propose new tighter grant" — full
 *      auditability and a clean learning signal for the agent's next
 *      proposal.
 *
 * State-machine transitions route through `assertTransition` (server-
 * side enforcement layer) before the DB UPDATE; the Postgres trigger
 * + RLS provide the other two layers.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { assertTransition } from "@kinetiks/lib/state-machines";
import type {
  AuthorityRevocationReason,
  GrantProposalEnvelopeMember,
} from "@kinetiks/types";

import type { ApprovalRecord } from "./types";

type Admin = SupabaseClient;

export interface AuthorityGrantApproveInput {
  /** Empty/undefined when approving as-proposed; otherwise the
   *  full replacement grant payload (per the Edit & Approve flow). */
  edits?: { grant: GrantProposalEnvelopeMember["grant"] } | null;
}

export interface AuthorityGrantApproveResult {
  outcome: "approved_as_proposed" | "approved_with_edits";
  /** The grant that's now active (either the original or the new one). */
  active_grant_id: string;
  /** Set on Edit & Approve: the new proposed grant awaiting approval. */
  successor_grant_id?: string;
  /** Set on Edit & Approve: the matching approval row id. */
  successor_approval_id?: string;
}

export interface AuthorityGrantRejectInput {
  /** Customer's free-text reason for rejecting. */
  rejection_reason: string;
}

/**
 * Approve. With no edits, the original grant transitions proposed →
 * active. With edits, the original is revoked with reason
 * `customer_edited` and a new proposed grant is inserted via the RPC.
 */
export async function applyAuthorityGrantApprove(
  admin: Admin,
  approval: ApprovalRecord,
  args: AuthorityGrantApproveInput,
): Promise<AuthorityGrantApproveResult> {
  const grant_id = readGrantId(approval);
  if (args.edits && args.edits.grant) {
    return await applyAuthorityGrantEditAndApprove({
      admin,
      approval,
      grant_id,
      replacement: args.edits.grant,
    });
  }

  // No edits: clean approve-as-proposed.
  assertTransition({
    entity: "kinetiks_authority_grants",
    from: "proposed",
    to: "active",
    actor: { kind: "user", userId: approval.account_id, accountId: approval.account_id },
  });
  const nowIso = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("kinetiks_authority_grants")
    .update({ status: "active", granted_at: nowIso })
    .eq("id", grant_id)
    .eq("account_id", approval.account_id)
    .eq("status", "proposed");
  if (updateErr) {
    throw new Error(
      `[authority-grant approval] failed to activate grant ${grant_id}: ${updateErr.message}`,
    );
  }
  await writeLedger(admin, {
    account_id: approval.account_id,
    event_type: "authority_grant_approved",
    grant_id,
    detail: {
      grant_id,
      approval_id: approval.id,
      edits_applied: false,
    },
  });
  return { outcome: "approved_as_proposed", active_grant_id: grant_id };
}

/**
 * Reject. Original grant transitions proposed → revoked with the
 * customer's reason carried into the Ledger.
 */
export async function applyAuthorityGrantReject(
  admin: Admin,
  approval: ApprovalRecord,
  args: AuthorityGrantRejectInput,
): Promise<void> {
  const grant_id = readGrantId(approval);
  assertTransition({
    entity: "kinetiks_authority_grants",
    from: "proposed",
    to: "revoked",
    actor: { kind: "user", userId: approval.account_id, accountId: approval.account_id },
  });
  const nowIso = new Date().toISOString();
  const reason: AuthorityRevocationReason = "customer_revoked";
  const { error: updateErr } = await admin
    .from("kinetiks_authority_grants")
    .update({
      status: "revoked",
      revoked_at: nowIso,
      revocation_reason: reason,
    })
    .eq("id", grant_id)
    .eq("account_id", approval.account_id)
    .eq("status", "proposed");
  if (updateErr) {
    throw new Error(
      `[authority-grant approval] failed to revoke grant ${grant_id}: ${updateErr.message}`,
    );
  }
  await writeLedger(admin, {
    account_id: approval.account_id,
    event_type: "authority_grant_revoked",
    grant_id,
    detail: {
      grant_id,
      revocation_reason: reason,
      customer_note: args.rejection_reason,
    },
  });
}

// ─────────────────────────────────────────────
// Edit & Approve
// ─────────────────────────────────────────────

interface EditAndApproveArgs {
  admin: Admin;
  approval: ApprovalRecord;
  /** The original grant_id (read from preview.grant_id). */
  grant_id: string;
  /** Customer's edited grant payload — replaces the original wholesale. */
  replacement: GrantProposalEnvelopeMember["grant"];
}

async function applyAuthorityGrantEditAndApprove(
  args: EditAndApproveArgs,
): Promise<AuthorityGrantApproveResult> {
  // Revoke the original with reason customer_edited.
  assertTransition({
    entity: "kinetiks_authority_grants",
    from: "proposed",
    to: "revoked",
    actor: {
      kind: "user",
      userId: args.approval.account_id,
      accountId: args.approval.account_id,
    },
  });
  const nowIso = new Date().toISOString();
  const reason: AuthorityRevocationReason = "customer_edited";
  const { error: revokeErr } = await args.admin
    .from("kinetiks_authority_grants")
    .update({
      status: "revoked",
      revoked_at: nowIso,
      revocation_reason: reason,
    })
    .eq("id", args.grant_id)
    .eq("account_id", args.approval.account_id)
    .eq("status", "proposed");
  if (revokeErr) {
    throw new Error(
      `[authority-grant approval] failed to revoke original grant ${args.grant_id} for edit-and-approve: ${revokeErr.message}`,
    );
  }

  // Read the original approval's preview to pull the original
  // reasoning + evidence so the successor proposal carries them
  // forward; the agent doesn't rerun the LLM here.
  const preview = (args.approval.preview ?? {}) as {
    content?: { grant_id?: string; reasoning?: string; evidence?: unknown };
    grant_id?: string;
    reasoning?: string;
    evidence?: unknown;
  };
  // The persist RPC nests the full proposal member under preview;
  // tolerate both flat and content-wrapped shapes.
  const original_reasoning =
    preview.reasoning ?? preview.content?.reasoning ?? "Customer-edited grant.";
  const original_evidence =
    preview.evidence ?? preview.content?.evidence ?? {
      patterns_referenced: [],
      similar_past_grants: [],
      ledger_summary: {
        proposals_last_90d: 0,
        approval_rate: 0,
        most_common_edit_type: null,
      },
      identity_signals: [],
    };

  // Insert the successor via the same RPC the Authority Agent uses.
  // Generate the new grant_id client-side so the RPC's idempotency
  // and forward-reference checks have a stable id to bind to.
  const successor_grant_id = crypto.randomUUID();
  const rpcPayload = [
    {
      grant_id: successor_grant_id,
      grant: {
        ...args.replacement,
        // Parent_grant_id is always null for a customer-edited
        // successor: the edit chain runs flat, not nested under the
        // original. Nesting is for Workflow-inside-Program, not for
        // edit history.
        parent_grant_id: null,
      },
      approval_title: args.replacement.scope_description,
      approval_description: `${args.replacement.granted_capabilities.length} permission${
        args.replacement.granted_capabilities.length === 1 ? "" : "s"
      } (edited from a previous proposal)`,
      approval_expires_at: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      reasoning: `${original_reasoning}\n\nEdited by the customer from a previous proposal (original grant ${args.grant_id}).`,
      evidence: original_evidence,
    },
  ];
  const { data, error: rpcErr } = await args.admin.rpc(
    "propose_authority_grants",
    {
      p_account_id: args.approval.account_id,
      p_granted_by: args.approval.account_id,
      p_proposed_by_agent: `authority_agent:customer_edit:${args.approval.id}`,
      p_proposals: rpcPayload,
    },
  );
  if (rpcErr) {
    throw new Error(
      `[authority-grant approval] failed to insert successor grant via RPC: ${rpcErr.message}`,
    );
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(
      `[authority-grant approval] successor RPC returned no rows`,
    );
  }
  const successor_approval_id = (data as Array<{ approval_id: string }>)[0].approval_id;

  // Ledger: revoked event + a narrowed marker pointing at the successor.
  await writeLedger(args.admin, {
    account_id: args.approval.account_id,
    event_type: "authority_grant_narrowed",
    grant_id: args.grant_id,
    detail: {
      grant_id: args.grant_id,
      successor_grant_id,
      changes_summary: summarizeChanges(args.replacement),
    },
  });
  await writeLedger(args.admin, {
    account_id: args.approval.account_id,
    event_type: "authority_grant_revoked",
    grant_id: args.grant_id,
    detail: {
      grant_id: args.grant_id,
      revocation_reason: "customer_edited" as AuthorityRevocationReason,
    },
  });

  return {
    // Note: the successor is `proposed`, not yet active. The customer
    // must re-approve via the new authority_grant_proposal row.
    outcome: "approved_with_edits",
    active_grant_id: successor_grant_id,
    successor_grant_id,
    successor_approval_id,
  };
}

function summarizeChanges(
  replacement: GrantProposalEnvelopeMember["grant"],
): string[] {
  // Lightweight summary safe to surface in Ledger / UI cards. The
  // changes themselves live in the new approval's preview; this is a
  // pointer summary.
  const out: string[] = [];
  out.push(`scope: ${replacement.scope_type}`);
  out.push(`capabilities: ${replacement.granted_capabilities.length}`);
  if (replacement.expires_at) out.push(`expires: ${replacement.expires_at}`);
  if (replacement.max_unapproved_spend_per_day !== null) {
    out.push(`spend/day: ${replacement.max_unapproved_spend_per_day}`);
  }
  return out;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function readGrantId(approval: ApprovalRecord): string {
  // The persist RPC stores preview = { grant_id, grant, reasoning, evidence }.
  // The ApprovalPreview type wraps it under `content`, so look in both
  // shapes defensively.
  const preview = (approval.preview ?? {}) as
    | { content?: { grant_id?: string }; grant_id?: string }
    | undefined;
  const direct = preview?.grant_id;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const nested = preview?.content?.grant_id;
  if (typeof nested === "string" && nested.length > 0) return nested;
  throw new Error(
    `[authority-grant approval] approval ${approval.id} preview missing grant_id`,
  );
}

interface LedgerInsert {
  account_id: string;
  event_type:
    | "authority_grant_approved"
    | "authority_grant_revoked"
    | "authority_grant_narrowed";
  grant_id: string;
  detail: Record<string, unknown>;
}

async function writeLedger(admin: Admin, entry: LedgerInsert): Promise<void> {
  const { error } = await admin.from("kinetiks_ledger").insert({
    account_id: entry.account_id,
    event_type: entry.event_type,
    source_app: "kinetiks_id",
    source_operator: "approval.authority_grant",
    grant_id: entry.grant_id,
    detail: entry.detail,
  });
  if (error) {
    // Ledger writes for lifecycle transitions are critical — surface
    // the failure so the route returns a structured 500. Audit drift
    // on grant lifecycle is worse than the customer seeing an error.
    throw new Error(
      `[authority-grant approval] ledger ${entry.event_type} insert failed: ${error.message}`,
    );
  }
}
