/**
 * Shared Proposal submission and ledger logging utilities for the Cartographer.
 * Used by crawl, conversation, and calibration flows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Proposal } from "@kinetiks/types";
import { evaluateProposal } from "@/lib/cortex/evaluate";
import type { EvaluationResult } from "@/lib/cortex/evaluate";
import type { ProposalInsert } from "./types";

/**
 * Insert a proposal into the database and evaluate it through the Cortex pipeline.
 * Insert failures throw. Evaluation failures are captured and returned so the
 * caller always gets the proposal ID when the insert succeeded.
 */
export async function submitProposal(
  admin: SupabaseClient,
  proposal: ProposalInsert
): Promise<{ proposalId: string; result: EvaluationResult }> {
  const { data, error } = await admin
    .from("kinetiks_proposals")
    .insert({
      ...proposal,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to insert proposal: ${error?.message ?? "no data returned"}`
    );
  }

  const row = data as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.status !== "string") {
    throw new Error(
      `Invalid proposal row returned: missing id or status (got id=${typeof row.id}, status=${typeof row.status})`
    );
  }

  const proposalId = row.id as string;
  const fullProposal = row as unknown as Proposal;

  try {
    const result = await evaluateProposal(admin, fullProposal);
    return { proposalId, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `Proposal ${proposalId} inserted but evaluation failed:`,
      message
    );
    return {
      proposalId,
      result: {
        proposal_id: proposalId,
        status: "submitted",
        decline_reason: `evaluation_error: ${message}`,
        routed: false,
      },
    };
  }
}

/**
 * Log an event to the Learning Ledger. Non-throwing - logs errors to console.
 */
export async function logToLedger(
  admin: SupabaseClient,
  accountId: string,
  eventType: string,
  detail: Record<string, unknown>
): Promise<void> {
  const { error } = await admin.from("kinetiks_ledger").insert({
    account_id: accountId,
    event_type: eventType,
    source_app: "cartographer",
    source_operator: detail.source_operator ?? "cartographer",
    detail: {
      ...detail,
      timestamp: new Date().toISOString(),
    },
  });

  if (error) {
    console.error(
      `Failed to log to ledger (account=${accountId}, type=${eventType}):`,
      error.message
    );
  }
}
