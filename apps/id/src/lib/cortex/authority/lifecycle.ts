/**
 * Authority Grant lifecycle Server Actions per the Kinetiks Contract Addendum §2.13.
 *
 * Four customer-driven transitions on an already-`active` (or `paused`)
 * grant from the Cortex Authority tab. The `proposed → active` and
 * `proposed → revoked` transitions are owned by the Approval System
 * (apps/id/src/lib/approvals/authority-grant.ts); this file owns
 * everything that happens after approval.
 *
 *   pauseGrant   → active → paused.        Halts new actions immediately.
 *                                          Existing in-flight tool calls
 *                                          finish; the next resolve()
 *                                          call returns null for this
 *                                          grant.
 *
 *   resumeGrant  → paused → active.        Resumes covered actions.
 *
 *   narrowGrant  → active → revoked        Tightens authority. The
 *                  + new `proposed`        narrowed grant is revoked
 *                  successor via the       with reason `customer_narrowed`;
 *                  propose_authority_      a successor proposal lands
 *                  grants RPC.             in the approval queue with
 *                                          tighter capabilities, ready
 *                                          for the customer to approve.
 *                                          Re-validation in-flight under
 *                                          the new shape happens at
 *                                          resolver time (the active
 *                                          grant is gone the moment we
 *                                          revoke; nothing covers the
 *                                          gap until the successor is
 *                                          approved). This matches
 *                                          §2.13's "narrow re-runs
 *                                          validation against in-flight
 *                                          actions" — the resolver IS
 *                                          the re-validation.
 *
 *   revokeGrant  → active|paused → revoked. Terminal; cannot be undone.
 *
 * Three-layer enforcement per CLAUDE.md:
 *   1. `assertTransition` here, before the DB write.
 *   2. Postgres trigger (00050_kinetiks_authority_grants.sql, lifecycle_guard).
 *   3. RLS denies non-service-role writes (this module runs under the
 *      service role via createAdminClient).
 *
 * Every transition emits an `kinetiks_ledger` row with `grant_id`
 * attached and the canonical event type
 * (`authority_grant_paused | _approved | _narrowed | _revoked`). Ledger
 * writes are blocking — audit drift on a lifecycle transition is worse
 * than the customer seeing an error and retrying.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { assertTransition } from "@kinetiks/lib/state-machines";
import type {
  AuthorityRevocationReason,
  GrantProposalEnvelope,
  GrantProposalEnvelopeMember,
} from "@kinetiks/types";

import { validateEnvelope } from "@/lib/operators/executors/authority-agent/validate";

type Admin = SupabaseClient;

// ============================================================
// Pause / Resume / Revoke
// ============================================================

export interface GrantLifecycleArgs {
  /** Authenticated account scope. */
  account_id: string;
  /** Acting customer (for the actor passed to `assertTransition`). */
  user_id: string;
  /** Grant to transition. */
  grant_id: string;
}

export interface PauseGrantArgs extends GrantLifecycleArgs {
  /** Optional plain-language note carried into the Ledger detail. */
  reason?: string;
}

export interface ResumeGrantArgs extends GrantLifecycleArgs {
  /** Optional plain-language note carried into the Ledger detail. */
  reason?: string;
}

export interface RevokeGrantArgs extends GrantLifecycleArgs {
  /** Required: customer's reason for revoking. Surfaces in the history view. */
  reason: string;
}

/**
 * active → paused. Halts new actions; in-flight calls finish on their
 * own. The resolver returns null for paused grants by design (see
 * resolve.ts: it filters `status = 'active'`).
 */
export async function pauseGrant(
  admin: Admin,
  args: PauseGrantArgs,
): Promise<void> {
  assertTransition({
    entity: "kinetiks_authority_grants",
    from: "active",
    to: "paused",
    actor: { kind: "user", userId: args.user_id, accountId: args.account_id },
  });

  const { data: paused, error } = await admin
    .from("kinetiks_authority_grants")
    .update({ status: "paused" })
    .eq("id", args.grant_id)
    .eq("account_id", args.account_id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      `[authority/lifecycle] failed to pause grant ${args.grant_id}: ${error.message}`,
    );
  }
  if (!paused) {
    // Concurrent customer action or status drift — surface the error
    // rather than emit a false-positive ledger entry.
    throw new Error(
      `[authority/lifecycle] no active grant matched for pause: ${args.grant_id}`,
    );
  }

  await writeLifecycleLedger(admin, {
    account_id: args.account_id,
    event_type: "authority_grant_paused",
    grant_id: args.grant_id,
    detail: {
      grant_id: args.grant_id,
      pause_reason: args.reason ?? null,
      actor_user_id: args.user_id,
    },
  });
}

/**
 * paused → active. Resumes covered actions.
 *
 * Logged with the dedicated `authority_grant_resumed` event type added
 * in migration 00054 — pause and revoke had explicit events, resume
 * did not, so a Ledger query could not answer "when did the customer
 * resume this grant?". The dedicated event closes that audit gap.
 */
export async function resumeGrant(
  admin: Admin,
  args: ResumeGrantArgs,
): Promise<void> {
  assertTransition({
    entity: "kinetiks_authority_grants",
    from: "paused",
    to: "active",
    actor: { kind: "user", userId: args.user_id, accountId: args.account_id },
  });

  const { data: resumed, error } = await admin
    .from("kinetiks_authority_grants")
    .update({ status: "active" })
    .eq("id", args.grant_id)
    .eq("account_id", args.account_id)
    .eq("status", "paused")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      `[authority/lifecycle] failed to resume grant ${args.grant_id}: ${error.message}`,
    );
  }
  if (!resumed) {
    throw new Error(
      `[authority/lifecycle] no paused grant matched for resume: ${args.grant_id}`,
    );
  }

  await writeLifecycleLedger(admin, {
    account_id: args.account_id,
    event_type: "authority_grant_resumed",
    grant_id: args.grant_id,
    detail: {
      grant_id: args.grant_id,
      resume_reason: args.reason ?? null,
      actor_user_id: args.user_id,
    },
  });
}

/**
 * active|paused → revoked. Terminal; cannot be undone. The trigger
 * enforces terminal-state immutability at the DB layer as a backstop.
 */
export async function revokeGrant(
  admin: Admin,
  args: RevokeGrantArgs,
): Promise<void> {
  // The grant might be active OR paused. Read first to know which
  // `from` state to assert against the state machine — assertTransition
  // is the first of the three layers and gives us a specific error
  // message instead of letting the DB trigger generate one.
  const { data: current, error: readErr } = await admin
    .from("kinetiks_authority_grants")
    .select("status, expires_at")
    .eq("id", args.grant_id)
    .eq("account_id", args.account_id)
    .maybeSingle();

  if (readErr) {
    throw new Error(
      `[authority/lifecycle] failed to read grant ${args.grant_id}: ${readErr.message}`,
    );
  }
  if (!current) {
    throw new Error(
      `[authority/lifecycle] grant not found for revoke: ${args.grant_id}`,
    );
  }
  const currentStatus = current.status as "active" | "paused" | "proposed" | "revoked" | "expired";
  if (currentStatus !== "active" && currentStatus !== "paused") {
    throw new Error(
      `[authority/lifecycle] cannot revoke grant in status '${currentStatus}'`,
    );
  }

  assertTransition({
    entity: "kinetiks_authority_grants",
    from: currentStatus,
    to: "revoked",
    actor: { kind: "user", userId: args.user_id, accountId: args.account_id },
  });

  const revocationReason: AuthorityRevocationReason = "customer_revoked";
  const nowIso = new Date().toISOString();
  const { data: revoked, error: updateErr } = await admin
    .from("kinetiks_authority_grants")
    .update({
      status: "revoked",
      revoked_at: nowIso,
      revocation_reason: revocationReason,
    })
    .eq("id", args.grant_id)
    .eq("account_id", args.account_id)
    .in("status", ["active", "paused"])
    .select("id")
    .maybeSingle();

  if (updateErr) {
    throw new Error(
      `[authority/lifecycle] failed to revoke grant ${args.grant_id}: ${updateErr.message}`,
    );
  }
  if (!revoked) {
    throw new Error(
      `[authority/lifecycle] no active or paused grant matched for revocation: ${args.grant_id}`,
    );
  }

  await writeLifecycleLedger(admin, {
    account_id: args.account_id,
    event_type: "authority_grant_revoked",
    grant_id: args.grant_id,
    detail: {
      grant_id: args.grant_id,
      revocation_reason: revocationReason,
      customer_note: args.reason,
      actor_user_id: args.user_id,
    },
  });
}

// ============================================================
// Narrow (revoke + successor proposal)
// ============================================================

export interface NarrowGrantArgs {
  /** Authenticated account scope. */
  account_id: string;
  /** Acting customer. */
  user_id: string;
  /** The active grant to narrow. */
  grant_id: string;
  /** The tightened grant payload — same shape the Authority Agent emits. */
  successor: GrantProposalEnvelopeMember["grant"];
  /** Optional plain-language reason carried into the narrowed Ledger entry. */
  reason?: string;
}

export interface NarrowGrantResult {
  /** New `proposed` grant_id awaiting a second customer approval. */
  successor_grant_id: string;
  /** Approval row that will surface in the customer's queue. */
  successor_approval_id: string;
}

/**
 * Narrow: revoke the active grant with reason `customer_narrowed` AND
 * insert a tighter successor proposal via the `propose_authority_grants`
 * RPC (same path the Authority Agent uses). The successor lands as
 * `proposed`; the customer approves it in the next pass.
 *
 * Atomicity: insert successor FIRST, then revoke. If the RPC fails the
 * original stays active (customer can retry); if the revoke fails after
 * the successor lands, the customer ends up with both visible — they
 * can reject the successor or revoke the original outright. A
 * single-statement atomic RPC would be cleaner; track as a follow-up if
 * pairs-of-orphans become a real failure mode (mirrors the approve-
 * with-edits ordering in authority-grant.ts).
 *
 * Re-validation against in-flight actions per addendum §2.13: covered
 * by the resolver. The active grant is gone the moment we revoke; any
 * in-flight action whose resolver call has not yet happened will fall
 * through to per-action approval until the successor is approved.
 */
export async function narrowGrant(
  admin: Admin,
  args: NarrowGrantArgs,
): Promise<NarrowGrantResult> {
  // Read current status first. Narrowing must work from BOTH active
  // and paused (a customer who paused while thinking about a shape may
  // still want to narrow). Without this read-first guard, calling
  // narrowGrant on a paused grant would insert the successor RPC and
  // then fail on the UPDATE filter `.eq("status", "active")` — leaving
  // an orphan successor in the approval queue with the original still
  // intact. Read-then-act mirrors the revokeGrant pattern.
  const { data: current, error: readErr } = await admin
    .from("kinetiks_authority_grants")
    .select("status")
    .eq("id", args.grant_id)
    .eq("account_id", args.account_id)
    .maybeSingle();
  if (readErr) {
    throw new Error(
      `[authority/lifecycle] failed to read grant ${args.grant_id} for narrow: ${readErr.message}`,
    );
  }
  if (!current) {
    throw new Error(
      `[authority/lifecycle] grant not found for narrow: ${args.grant_id}`,
    );
  }
  const currentStatus = current.status as
    | "proposed"
    | "active"
    | "paused"
    | "revoked"
    | "expired";
  if (currentStatus !== "active" && currentStatus !== "paused") {
    throw new Error(
      `[authority/lifecycle] cannot narrow grant in status '${currentStatus}'`,
    );
  }

  // assertTransition with the actual from-state so the state machine
  // veto matches reality. Both active→revoked and paused→revoked are
  // legal transitions.
  assertTransition({
    entity: "kinetiks_authority_grants",
    from: currentStatus,
    to: "revoked",
    actor: { kind: "user", userId: args.user_id, accountId: args.account_id },
  });

  // Structural validation: action class registry, constraint schemas,
  // escalation trigger schemas, the customer-language phrase block,
  // customer_template placeholder coverage. Same validator the
  // Authority Agent runs before its own persist call — the narrow
  // endpoint must not be a bypass for it. parent_grant_id is forced
  // to null below so the §2.8 subset rules trivially pass.
  const successor_grant_id = crypto.randomUUID();
  const successor = { ...args.successor, parent_grant_id: null };
  // Synthesize the envelope the validator expects (invocation_id +
  // request_type are required for the type, but the validator only
  // reads `proposed_grants`; the wrapper fields are bookkeeping).
  const envelope: GrantProposalEnvelope = {
    invocation_id: `cortex_authority:customer_narrow:${args.grant_id}`,
    request_type: "standing_review",
    proposed_grants: [
      {
        grant_id: successor_grant_id,
        grant: successor,
        reasoning:
          args.reason && args.reason.length >= 40
            ? args.reason
            : `Narrowed from grant ${args.grant_id} by customer action from the Cortex Authority sub-tab.`,
        evidence: {
          patterns_referenced: [],
          similar_past_grants: [],
          ledger_summary: {
            proposals_last_90d: 0,
            approval_rate: 0,
            most_common_edit_type: null,
          },
          identity_signals: [],
        },
      },
    ],
  };
  const validateRes = validateEnvelope(envelope);
  if (!validateRes.ok) {
    throw new Error(
      `[authority/lifecycle] narrow successor failed structural validation: ${validateRes.errors.join("; ")}`,
    );
  }

  const rpcPayload = [
    {
      grant_id: successor_grant_id,
      // `successor` is the validated payload (parent_grant_id forced
      // to null above so the nested-grants subset check trivially
      // passes; edits run flat — nesting is for Workflow-inside-
      // Program, not edit history).
      grant: successor,
      approval_title: successor.scope_description,
      approval_description: `${successor.granted_capabilities.length} permission${
        successor.granted_capabilities.length === 1 ? "" : "s"
      } (narrowed from a previous grant)`,
      approval_expires_at: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      // Reasoning length floor (40 chars) matches the validator's
      // schema. When the customer supplies a short note we prepend
      // standard framing; with no note we synthesize the full string.
      reasoning:
        args.reason && args.reason.trim().length > 0
          ? `Narrowed from grant ${args.grant_id} by customer action from the Cortex Authority sub-tab. Customer note: ${args.reason.trim()}`
          : `Narrowed from grant ${args.grant_id} by customer action from the Cortex Authority sub-tab.`,
      evidence: {
        // The narrow → revoke audit chain lives in the Ledger
        // (authority_grant_narrowed + authority_grant_revoked) below.
        // The successor's evidence is empty: this proposal didn't come
        // from the Authority Agent's pattern-grounded reasoning, it
        // came from the customer directly narrowing.
        patterns_referenced: [],
        similar_past_grants: [],
        ledger_summary: {
          proposals_last_90d: 0,
          approval_rate: 0,
          most_common_edit_type: null,
        },
        identity_signals: [],
      },
    },
  ];

  const { data: rpcData, error: rpcErr } = await admin.rpc(
    "propose_authority_grants",
    {
      p_account_id: args.account_id,
      p_granted_by: args.account_id,
      p_proposed_by_agent: `cortex_authority:customer_narrow:${args.grant_id}`,
      p_proposals: rpcPayload,
    },
  );
  if (rpcErr) {
    throw new Error(
      `[authority/lifecycle] narrow successor RPC failed: ${rpcErr.message}`,
    );
  }
  if (!Array.isArray(rpcData) || rpcData.length === 0) {
    throw new Error(
      `[authority/lifecycle] narrow successor RPC returned no rows`,
    );
  }
  const successor_approval_id = (rpcData as Array<{ approval_id: string }>)[0]
    .approval_id;

  // Revoke the original. Two-step ordering: if this fails after the
  // successor lands, the audit trail (narrowed ledger entry below)
  // points at the successor. Narrow accepts both active and paused
  // (verified by the read-first guard above) — filter to those two
  // so a concurrent expiry / revoke does not silently produce an
  // orphan successor pair.
  const revocationReason: AuthorityRevocationReason = "customer_narrowed";
  const nowIso = new Date().toISOString();
  const { data: revoked, error: revokeErr } = await admin
    .from("kinetiks_authority_grants")
    .update({
      status: "revoked",
      revoked_at: nowIso,
      revocation_reason: revocationReason,
    })
    .eq("id", args.grant_id)
    .eq("account_id", args.account_id)
    .in("status", ["active", "paused"])
    .select("id")
    .maybeSingle();

  if (revokeErr) {
    throw new Error(
      `[authority/lifecycle] narrow successor ${successor_grant_id} proposed but failed to revoke original ${args.grant_id}: ${revokeErr.message}`,
    );
  }
  if (!revoked) {
    throw new Error(
      `[authority/lifecycle] narrow successor ${successor_grant_id} proposed but no active or paused grant matched for revocation: ${args.grant_id}`,
    );
  }

  // Ledger: narrowed (points at successor) + revoked (the rationale).
  await writeLifecycleLedger(admin, {
    account_id: args.account_id,
    event_type: "authority_grant_narrowed",
    grant_id: args.grant_id,
    detail: {
      grant_id: args.grant_id,
      successor_grant_id,
      changes_summary: summarizeChanges(args.successor),
      actor_user_id: args.user_id,
    },
  });
  await writeLifecycleLedger(admin, {
    account_id: args.account_id,
    event_type: "authority_grant_revoked",
    grant_id: args.grant_id,
    detail: {
      grant_id: args.grant_id,
      revocation_reason: revocationReason,
      customer_note: args.reason,
      actor_user_id: args.user_id,
    },
  });

  return { successor_grant_id, successor_approval_id };
}

// ============================================================
// Internal helpers
// ============================================================

function summarizeChanges(
  replacement: GrantProposalEnvelopeMember["grant"],
): string[] {
  // Lightweight pointer summary surfaced in Ledger / UI cards. The
  // full diff lives in the successor approval's preview; this just
  // names what changed at the shape level.
  const out: string[] = [];
  out.push(`scope: ${replacement.scope_type}`);
  out.push(`capabilities: ${replacement.granted_capabilities.length}`);
  if (replacement.expires_at) out.push(`expires: ${replacement.expires_at}`);
  if (replacement.max_unapproved_spend_per_day !== null) {
    out.push(`spend/day: ${replacement.max_unapproved_spend_per_day}`);
  }
  return out;
}

interface LifecycleLedgerInsert {
  account_id: string;
  event_type:
    | "authority_grant_paused"
    | "authority_grant_resumed"
    | "authority_grant_revoked"
    | "authority_grant_narrowed";
  grant_id: string;
  detail: Record<string, unknown>;
}

async function writeLifecycleLedger(
  admin: Admin,
  entry: LifecycleLedgerInsert,
): Promise<void> {
  const { error } = await admin.from("kinetiks_ledger").insert({
    account_id: entry.account_id,
    event_type: entry.event_type,
    source_app: "kinetiks_id",
    source_operator: "cortex.authority_lifecycle",
    grant_id: entry.grant_id,
    detail: entry.detail,
  });
  if (error) {
    throw new Error(
      `[authority/lifecycle] ledger ${entry.event_type} insert failed: ${error.message}`,
    );
  }
}
