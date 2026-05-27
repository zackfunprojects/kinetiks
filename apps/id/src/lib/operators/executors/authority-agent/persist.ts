/**
 * Authority Agent persistence per Kinetiks Contract Addendum §2.7.
 *
 * Wraps `propose_authority_grants` (migration 00052), the atomic RPC
 * that inserts N proposed grants + N matching authority_grant_proposal
 * approval rows in a single transaction. The agent's executor calls
 * this AFTER structural validation passes so by the time we arrive
 * every payload is shape-correct.
 *
 * Returns `{ grant_ids, approval_ids }` in input order — the caller
 * uses these to emit `authority_grant_proposed` Ledger entries (one
 * per grant) immediately after persistence.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  GrantProposalEnvelope,
  GrantProposalEnvelopeMember,
} from "@kinetiks/types";

export interface PersistArgs {
  account_id: string;
  granted_by: string;
  proposed_by_agent: string;
  envelope: GrantProposalEnvelope;
}

export interface PersistResult {
  grant_ids: string[];
  approval_ids: string[];
}

/**
 * Convert each envelope member into the jsonb shape the RPC expects:
 *   {
 *     grant_id: string,
 *     grant: { ...PayloadShape },
 *     approval_title: string,
 *     approval_description: string,
 *     approval_expires_at: string | null
 *   }
 *
 * The approval card's title is the grant's scope_description (already
 * plain-language by validator rule). The description is a short
 * customer-facing summary built from the reasoning + the first
 * granted capability's plain-language description. The approval
 * expires when the grant proposal goes stale — 7 days for v1.
 */
function shapeMemberForRpc(
  member: GrantProposalEnvelopeMember,
): Record<string, unknown> {
  const firstCap = member.grant.granted_capabilities[0];
  const approvalDescription = firstCap
    ? `${member.grant.granted_capabilities.length} permission${member.grant.granted_capabilities.length === 1 ? "" : "s"}: ${firstCap.description}`
    : member.reasoning.slice(0, 200);
  const approvalExpiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  return {
    grant_id: member.grant_id,
    grant: member.grant,
    approval_title: member.grant.scope_description,
    approval_description: approvalDescription,
    approval_expires_at: approvalExpiresAt,
    // The reasoning + evidence ride along in the approval's `preview`
    // jsonb via the RPC (the RPC stores the whole proposal member
    // under preview.grant + preview.reasoning + preview.evidence).
    reasoning: member.reasoning,
    evidence: member.evidence,
  };
}

export async function persistProposals(args: PersistArgs): Promise<PersistResult> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const proposalsForRpc = args.envelope.proposed_grants.map(shapeMemberForRpc);

  const { data, error } = await admin.rpc("propose_authority_grants", {
    p_account_id: args.account_id,
    p_granted_by: args.granted_by,
    p_proposed_by_agent: args.proposed_by_agent,
    p_proposals: proposalsForRpc,
  });

  if (error) {
    throw new Error(
      `[authority-agent/persist] propose_authority_grants RPC failed: ${error.message}`,
    );
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(
      `[authority-agent/persist] propose_authority_grants RPC returned no rows`,
    );
  }

  const grant_ids: string[] = [];
  const approval_ids: string[] = [];
  for (const row of data as Array<{ grant_id: string; approval_id: string }>) {
    grant_ids.push(row.grant_id);
    approval_ids.push(row.approval_id);
  }
  return { grant_ids, approval_ids };
}
