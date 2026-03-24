import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { evaluateProposal } from "@/lib/cortex/evaluate";
import { recalculateConfidence } from "@/lib/cortex/confidence";
import { resolveProposal } from "@/lib/cortex/resolve-proposal";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import type { Proposal } from "@kinetiks/types";

/**
 * POST /api/cortex/evaluate
 *
 * Evaluate a single proposal through the 5-step Cortex pipeline.
 * Called by Synapses when submitting proposals, or by the CRON
 * function to process the queue.
 *
 * Body: { proposal_id: string } or { proposal_ids: string[] }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  const body = await request.json();
  const admin = createAdminClient();

  // Validate and normalize proposal IDs
  let proposalIds: string[];

  if (Array.isArray(body.proposal_ids)) {
    // Batch mode: every element must be a non-empty string
    if (
      body.proposal_ids.length === 0 ||
      !body.proposal_ids.every(
        (id: unknown) => typeof id === "string" && id.length > 0
      )
    ) {
      return apiError("proposal_ids must be a non-empty array of non-empty strings", 400);
    }
    proposalIds = body.proposal_ids as string[];
  } else if (typeof body.proposal_id === "string" && body.proposal_id.length > 0) {
    // Single mode
    proposalIds = [body.proposal_id];
  } else {
    return apiError("Missing or invalid proposal_id (string) or proposal_ids (string[])", 400);
  }

  // Fetch proposals from database
  const { data: proposals, error: fetchError } = await admin
    .from("kinetiks_proposals")
    .select("*")
    .in("id", proposalIds)
    .eq("status", "submitted");

  if (fetchError) {
    return apiError("Failed to fetch proposals", 500);
  }

  if (!proposals || proposals.length === 0) {
    return apiError("No submitted proposals found with given IDs", 404);
  }

  // If not internal service call, verify the authenticated user owns all proposals
  if (auth.auth_method !== "internal") {
    const { data: userAccounts } = await admin
      .from("kinetiks_accounts")
      .select("id")
      .eq("user_id", auth.user_id);

    const ownedAccountIds = new Set(
      (userAccounts ?? []).map((a) => a.id as string)
    );

    const unauthorizedProposal = proposals.find(
      (p) => !ownedAccountIds.has(p.account_id as string)
    );

    if (unauthorizedProposal) {
      return apiError("Forbidden: proposal does not belong to your account", 403);
    }
  }

  // Evaluate each proposal with per-proposal error handling
  const results: Array<{
    proposal_id: string;
    status: string;
    decline_reason: string | null;
    routed: boolean;
    error?: string;
  }> = [];
  const affectedAccounts = new Set<string>();

  for (const row of proposals) {
    const proposal = row as unknown as Proposal;
    try {
      const result = await evaluateProposal(admin, proposal);
      results.push(result);
      if (result.status === "accepted") {
        affectedAccounts.add(proposal.account_id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `Failed to evaluate proposal ${proposal.id}:`,
        message
      );
      results.push({
        proposal_id: proposal.id,
        status: "error",
        decline_reason: null,
        routed: false,
        error: message,
      });
    }
  }

  // Recalculate confidence for all affected accounts (individually guarded)
  for (const accountId of affectedAccounts) {
    try {
      await recalculateConfidence(admin, accountId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `Failed to recalculate confidence for account ${accountId}:`,
        message
      );
    }
  }

  return apiSuccess({
    results,
    evaluated: results.length,
    accepted: results.filter((r) => r.status === "accepted").length,
    declined: results.filter((r) => r.status === "declined").length,
    escalated: results.filter((r) => r.status === "escalated").length,
    errors: results.filter((r) => r.status === "error").length,
  });
}

/**
 * PATCH /api/cortex/evaluate
 *
 * User decision on an escalated proposal.
 * Body: { proposal_id: string; decision: 'accept' | 'decline' }
 */
export async function PATCH(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  const body = await request.json();
  const { proposal_id, decision } = body as {
    proposal_id: string;
    decision: "accept" | "decline";
  };

  if (!proposal_id || !decision || !["accept", "decline"].includes(decision)) {
    return apiError("Missing proposal_id or invalid decision (accept/decline)", 400);
  }

  const admin = createAdminClient();

  const result = await resolveProposal(
    admin,
    auth.account_id,
    proposal_id,
    decision,
    auth.auth_method
  );

  if (result.error) {
    return apiError(result.error, 404);
  }

  return apiSuccess(result);
}
