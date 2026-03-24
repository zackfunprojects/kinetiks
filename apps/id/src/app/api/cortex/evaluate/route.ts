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
      return NextResponse.json(
        { error: "proposal_ids must be a non-empty array of non-empty strings" },
        { status: 400 }
      );
    }
    proposalIds = body.proposal_ids as string[];
  } else if (typeof body.proposal_id === "string" && body.proposal_id.length > 0) {
    // Single mode
    proposalIds = [body.proposal_id];
  } else {
    return NextResponse.json(
      { error: "Missing or invalid proposal_id (string) or proposal_ids (string[])" },
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

/**
 * PATCH /api/cortex/evaluate
 *
 * User decision on an escalated proposal.
 * Body: { proposal_id: string; decision: 'accept' | 'decline' }
 */
export async function PATCH(request: Request) {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { proposal_id, decision } = body as {
    proposal_id: string;
    decision: "accept" | "decline";
  };

  if (!proposal_id || !decision || !["accept", "decline"].includes(decision)) {
    return NextResponse.json(
      { error: "Missing proposal_id or invalid decision (accept/decline)" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify user owns this proposal
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const { data: proposal } = await admin
    .from("kinetiks_proposals")
    .select("*")
    .eq("id", proposal_id)
    .eq("account_id", account.id)
    .eq("status", "escalated")
    .single();

  if (!proposal) {
    return NextResponse.json(
      { error: "Escalated proposal not found" },
      { status: 404 }
    );
  }

  const newStatus = decision === "accept" ? "accepted" : "declined";

  // Update proposal status
  const { error: proposalUpdateError } = await admin
    .from("kinetiks_proposals")
    .update({
      status: newStatus,
      evaluated_at: new Date().toISOString(),
      evaluated_by: "user",
      ...(decision === "decline" ? { decline_reason: "user_dismissed" } : {}),
    })
    .eq("id", proposal_id);

  if (proposalUpdateError) {
    console.error(`Failed to update proposal ${proposal_id}:`, proposalUpdateError.message);
    return NextResponse.json(
      { error: "Failed to update proposal status" },
      { status: 500 }
    );
  }

  if (decision === "accept") {
    // Merge the proposal data into the context layer
    const typedProposal = proposal as unknown as Proposal;
    const tableName = `kinetiks_context_${typedProposal.target_layer}`;

    const { data: existingRow, error: selectError } = await admin
      .from(tableName)
      .select("data")
      .eq("account_id", account.id)
      .maybeSingle();

    if (selectError) {
      console.error(`Failed to read ${tableName} for account ${account.id}:`, selectError.message);
      return NextResponse.json(
        { error: "Failed to read context layer" },
        { status: 500 }
      );
    }

    const existingData = (existingRow?.data as Record<string, unknown>) || {};
    const mergedData = {
      ...existingData,
      ...typedProposal.payload,
    };

    const { error: upsertError } = await admin
      .from(tableName)
      .upsert(
        {
          account_id: account.id,
          data: mergedData,
          source: "user_explicit",
          source_detail: "escalated_proposal_accepted",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id" }
      );

    if (upsertError) {
      console.error(`Failed to upsert ${tableName} for account ${account.id}:`, upsertError.message);
      return NextResponse.json(
        { error: "Failed to update context layer" },
        { status: 500 }
      );
    }

    await recalculateConfidence(admin, account.id);
  }

  // Log to ledger
  const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
    account_id: account.id,
    event_type: decision === "accept" ? "proposal_accepted" : "proposal_declined",
    source_app: proposal.source_app,
    source_operator: proposal.source_operator,
    target_layer: proposal.target_layer,
    detail: {
      proposal_id,
      decision,
      evaluated_by: "user",
      payload_summary: Object.keys(proposal.payload as Record<string, unknown>),
    },
  });

  if (ledgerError) {
    // Ledger failure is non-fatal - the proposal decision was already applied
    console.error(`Failed to log ledger entry for proposal ${proposal_id}:`, ledgerError.message);
  }

  return NextResponse.json({ success: true, status: newStatus });
}
