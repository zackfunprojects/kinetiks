/**
 * Shared Proposal submission and ledger logging utilities for the Cartographer.
 * Used by crawl, conversation, and calibration flows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContextLayer, Proposal } from "@kinetiks/types";
import { evaluateProposal } from "@/lib/cortex/evaluate";
import type { EvaluationResult } from "@/lib/cortex/evaluate";
import type { ProposalInsert } from "./types";

const VALID_LAYERS: ContextLayer[] = [
  "org",
  "products",
  "voice",
  "customers",
  "narrative",
  "competitive",
  "market",
  "brand",
];

const VALID_ACTIONS = ["add", "update", "escalate"];
const VALID_CONFIDENCES = ["validated", "inferred", "speculative"];

/**
 * Validate a ProposalInsert before database insertion.
 * Returns null if valid, error string if invalid.
 */
function validateProposalInsert(proposal: ProposalInsert): string | null {
  if (!proposal.account_id || typeof proposal.account_id !== "string") {
    return "Missing or invalid account_id";
  }
  if (!proposal.source_app || typeof proposal.source_app !== "string") {
    return "Missing or invalid source_app";
  }
  if (!VALID_LAYERS.includes(proposal.target_layer)) {
    return `Invalid target_layer: ${proposal.target_layer}`;
  }
  if (!VALID_ACTIONS.includes(proposal.action)) {
    return `Invalid action: ${proposal.action}`;
  }
  if (!VALID_CONFIDENCES.includes(proposal.confidence)) {
    return `Invalid confidence: ${proposal.confidence}`;
  }
  if (
    !proposal.payload ||
    typeof proposal.payload !== "object" ||
    Array.isArray(proposal.payload)
  ) {
    return "payload must be a non-null object";
  }
  if (Object.keys(proposal.payload).length === 0) {
    return "payload must not be empty";
  }
  if (!Array.isArray(proposal.evidence)) {
    return "evidence must be an array";
  }
  return null;
}

/**
 * Insert a proposal into the database and evaluate it through the Cortex pipeline.
 * Validates the proposal shape before insertion. Insert failures throw.
 * Evaluation failures are captured and returned so the caller always gets
 * the proposal ID when the insert succeeded.
 */
export async function submitProposal(
  admin: SupabaseClient,
  proposal: ProposalInsert
): Promise<{ proposalId: string; result: EvaluationResult }> {
  const validationError = validateProposalInsert(proposal);
  if (validationError) {
    throw new Error(`Proposal validation failed: ${validationError}`);
  }

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
