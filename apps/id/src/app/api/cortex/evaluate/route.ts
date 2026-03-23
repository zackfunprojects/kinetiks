import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { evaluateProposal } from "@/lib/cortex/evaluate";
import { recalculateConfidence } from "@/lib/cortex/confidence";
import type { Proposal } from "@kinetiks/types";
import { NextResponse } from "next/server";

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
  // Auth check - only authenticated users or internal service calls
  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  // Check for dedicated internal service secret (used by Edge Functions / CRON)
  const authHeader = request.headers.get("authorization");
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  const isServiceCall =
    !!internalSecret && authHeader === `Bearer ${internalSecret}`;

  if ((authError || !user) && !isServiceCall) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const admin = createAdminClient();

  // Support single or batch evaluation
  const proposalIds: string[] = body.proposal_ids ?? [body.proposal_id];

  if (!proposalIds.length || !proposalIds[0]) {
    return NextResponse.json(
      { error: "Missing proposal_id or proposal_ids" },
      { status: 400 }
    );
  }

  // Fetch proposals from database
  const { data: proposals, error: fetchError } = await admin
    .from("kinetiks_proposals")
    .select("*")
    .in("id", proposalIds)
    .eq("status", "submitted");

  if (fetchError) {
    return NextResponse.json(
      { error: "Failed to fetch proposals" },
      { status: 500 }
    );
  }

  if (!proposals || proposals.length === 0) {
    return NextResponse.json(
      { error: "No submitted proposals found with given IDs" },
      { status: 404 }
    );
  }

  // If not internal service call, verify the authenticated user owns all proposals
  if (!isServiceCall && user) {
    const { data: userAccounts } = await admin
      .from("kinetiks_accounts")
      .select("id")
      .eq("user_id", user.id);

    const ownedAccountIds = new Set(
      (userAccounts ?? []).map((a) => a.id as string)
    );

    const unauthorizedProposal = proposals.find(
      (p) => !ownedAccountIds.has(p.account_id as string)
    );

    if (unauthorizedProposal) {
      return NextResponse.json(
        { error: "Forbidden: proposal does not belong to your account" },
        { status: 403 }
      );
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

  return NextResponse.json({
    results,
    evaluated: results.length,
    accepted: results.filter((r) => r.status === "accepted").length,
    declined: results.filter((r) => r.status === "declined").length,
    escalated: results.filter((r) => r.status === "escalated").length,
    errors: results.filter((r) => r.status === "error").length,
  });
}
