import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { evaluateProposal } from "@/lib/cortex/evaluate";
import { recalculateConfidence } from "@/lib/cortex/confidence";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import type {
  ContextLayer,
  Proposal,
  ProposalAction,
  ProposalConfidence,
  Evidence,
} from "@kinetiks/types";

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

const VALID_ACTIONS: ProposalAction[] = ["add", "update", "escalate"];
const VALID_CONFIDENCE: ProposalConfidence[] = [
  "validated",
  "inferred",
  "speculative",
];

interface ProposeRequest {
  account_id: string;
  source_app: string;
  source_operator?: string;
  target_layer: ContextLayer;
  action: ProposalAction;
  confidence: ProposalConfidence;
  payload: Record<string, unknown>;
  evidence?: Evidence[];
  expires_at?: string;
}

/**
 * POST /api/synapse/propose
 *
 * Endpoint for app Synapses to submit Proposals to the Cortex.
 * Inserts the proposal, runs it through the 5-step evaluation pipeline,
 * and returns the result.
 *
 * Auth: user session, API key, or internal service secret
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { allowInternal: true });
  if (error) return error;

  let body: ProposeRequest;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed as ProposeRequest;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  // Validate required fields
  const {
    account_id,
    source_app,
    source_operator,
    target_layer,
    action,
    confidence,
    payload,
    evidence,
    expires_at,
  } = body;

  if (!account_id || typeof account_id !== "string") {
    return apiError("Missing or invalid account_id", 400);
  }

  if (!source_app || typeof source_app !== "string") {
    return apiError("Missing or invalid source_app", 400);
  }

  if (!VALID_LAYERS.includes(target_layer)) {
    return apiError(`Invalid target_layer: ${target_layer}`, 400);
  }

  if (!VALID_ACTIONS.includes(action)) {
    return apiError(`Invalid action: ${action}. Must be add, update, or escalate`, 400);
  }

  if (!VALID_CONFIDENCE.includes(confidence)) {
    return apiError(
      `Invalid confidence: ${confidence}. Must be validated, inferred, or speculative`,
      400
    );
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return apiError("payload must be a non-null object", 400);
  }

  if (Object.keys(payload).length === 0) {
    return apiError("payload must not be empty", 400);
  }

  if (evidence !== undefined && !Array.isArray(evidence)) {
    return apiError("evidence must be an array", 400);
  }

  if (source_operator !== undefined && (typeof source_operator !== "string" || source_operator.trim().length === 0)) {
    return apiError("source_operator must be a non-empty string or omitted", 400);
  }

  if (expires_at !== undefined) {
    if (typeof expires_at !== "string" || expires_at.trim().length === 0) {
      return apiError("expires_at must be a non-empty ISO timestamp string or omitted", 400);
    }
    if (isNaN(Date.parse(expires_at))) {
      return apiError("expires_at must be a valid ISO timestamp", 400);
    }
  }

  const admin = createAdminClient();

  // If not internal service call, verify account ownership
  if (auth.auth_method !== "internal") {
    const { data: account } = await admin
      .from("kinetiks_accounts")
      .select("id")
      .eq("id", account_id)
      .eq("user_id", auth.user_id)
      .single();

    if (!account) {
      return apiError("Forbidden: account does not belong to you", 403);
    }
  }

  // Verify Synapse exists, is active, and has write access to target layer
  const { data: synapse, error: synapseError } = await admin
    .from("kinetiks_synapses")
    .select("write_layers, status")
    .eq("account_id", account_id)
    .eq("app_name", source_app)
    .single();

  if (synapseError || !synapse) {
    return apiError(`No Synapse found for app '${source_app}' on this account`, 404);
  }

  if (synapse.status !== "active") {
    return apiError(
      `Synapse for '${source_app}' is not active (status: ${synapse.status})`,
      403
    );
  }

  const writeLayers = synapse.write_layers as string[];
  if (!writeLayers.includes(target_layer)) {
    return apiError(
      `Synapse '${source_app}' does not have write access to layer '${target_layer}'`,
      403
    );
  }

  // Insert proposal into the queue
  const { data: inserted, error: insertError } = await admin
    .from("kinetiks_proposals")
    .insert({
      account_id,
      source_app,
      source_operator: source_operator ?? null,
      target_layer,
      action,
      confidence,
      payload,
      evidence: evidence ?? [],
      status: "submitted",
      expires_at: expires_at ?? null,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    console.error("Failed to insert proposal:", insertError?.message);
    return apiError("Failed to create proposal", 500);
  }

  const proposal = inserted as unknown as Proposal;

  // Run through the Cortex evaluation pipeline
  try {
    const evaluation = await evaluateProposal(admin, proposal);

    // Recalculate confidence if proposal was accepted
    if (evaluation.status === "accepted") {
      try {
        await recalculateConfidence(admin, account_id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(
          `Confidence recalculation failed for account ${account_id}:`,
          message
        );
      }
    }

    return apiSuccess({
      proposal_id: proposal.id,
      evaluation: {
        status: evaluation.status,
        decline_reason: evaluation.decline_reason,
        routed: evaluation.routed,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `Evaluation failed for proposal ${proposal.id}:`,
      message
    );

    return apiSuccess({
      proposal_id: proposal.id,
      evaluation: {
        status: "error",
        decline_reason: null,
        routed: false,
        error: message,
      },
    });
  }
}
