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
  // Auth check - only authenticated users or service role
  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  // Also check for service role header (Edge Functions)
  const authHeader = request.headers.get("authorization");
  const isServiceRole =
    authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;

  if ((authError || !user) && !isServiceRole) {
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

  // Evaluate each proposal
  const results = [];
  const affectedAccounts = new Set<string>();

  for (const row of proposals) {
    const proposal = row as unknown as Proposal;
    const result = await evaluateProposal(admin, proposal);
    results.push(result);

    if (result.status === "accepted") {
      affectedAccounts.add(proposal.account_id);
    }
  }

  // Recalculate confidence for all affected accounts
  for (const accountId of affectedAccounts) {
    await recalculateConfidence(admin, accountId);
  }

  return NextResponse.json({
    results,
    evaluated: results.length,
    accepted: results.filter((r) => r.status === "accepted").length,
    declined: results.filter((r) => r.status === "declined").length,
    escalated: results.filter((r) => r.status === "escalated").length,
  });
}
