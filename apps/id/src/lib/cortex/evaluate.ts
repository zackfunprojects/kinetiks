import type { Proposal, ProposalStatus, ContextLayer } from "@kinetiks/types";
import { SupabaseClient } from "@supabase/supabase-js";
import { detectConflict } from "./conflict";

/**
 * Recency throttle window: don't route the same layer+app within this window.
 */
const RECENCY_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Valid target layers for schema validation
 */
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

/**
 * Required top-level fields per layer (at least one must be present for the payload to be valid)
 */
const LAYER_FIELDS: Record<ContextLayer, string[]> = {
  org: [
    "company_name",
    "industry",
    "stage",
    "geography",
    "website",
    "description",
    "legal_entity",
    "sub_industry",
    "founded_year",
    "team_size",
    "funding_status",
  ],
  products: ["products"],
  voice: [
    "tone",
    "vocabulary",
    "messaging_patterns",
    "writing_samples",
    "calibration_data",
    "platform_variants",
  ],
  customers: ["personas", "demographics", "analytics_data"],
  narrative: [
    "origin_story",
    "founder_thesis",
    "why_now",
    "brand_arc",
    "validated_angles",
    "media_positioning",
  ],
  competitive: ["competitors", "positioning_gaps", "differentiation_vectors"],
  market: [
    "trends",
    "media_sentiment",
    "llm_representation",
    "seasonal_patterns",
    "regulatory_signals",
  ],
  brand: [
    "colors",
    "typography",
    "tokens",
    "imagery",
    "motion",
    "modes",
    "accessibility",
    "logo",
    "social_visual_id",
  ],
};

/**
 * Minimum evidence quality threshold. Proposals with relevance scores below
 * this value are declined as low_relevance.
 */
const RELEVANCE_THRESHOLD = 0.3;

export interface EvaluationResult {
  proposal_id: string;
  status: ProposalStatus;
  decline_reason: string | null;
  routed: boolean;
}

/**
 * The 5-step Cortex evaluation pipeline.
 *
 * 1. Schema validation - well-formed? Correct payload for target layer?
 * 2. Conflict detection - contradicts user data? Ownership hierarchy check.
 * 3. Relevance scoring - evidence quality, recency, specificity, novelty.
 * 4. Merge - add inserts, update refines, escalate surfaces to user.
 * 5. Route - determine which Synapses need this learning.
 */
export async function evaluateProposal(
  admin: SupabaseClient,
  proposal: Proposal
): Promise<EvaluationResult> {
  // ── Step 1: Schema Validation ──
  const schemaError = validateSchema(proposal);
  if (schemaError) {
    await updateProposalStatus(admin, proposal.id, "declined", schemaError);
    await logToLedger(admin, proposal, "proposal_declined", {
      reason: schemaError,
      step: "schema_validation",
    });
    return {
      proposal_id: proposal.id,
      status: "declined",
      decline_reason: schemaError,
      routed: false,
    };
  }

  // ── Step 2: Conflict Detection ──
  const conflict = await detectConflict(admin, proposal);

  if (conflict.action === "decline") {
    await updateProposalStatus(
      admin,
      proposal.id,
      "declined",
      conflict.reason
    );
    await logToLedger(admin, proposal, "proposal_declined", {
      reason: conflict.reason,
      step: "conflict_detection",
      existing_source: conflict.existing_source,
    });
    return {
      proposal_id: proposal.id,
      status: "declined",
      decline_reason: conflict.reason,
      routed: false,
    };
  }

  if (conflict.action === "escalate") {
    await updateProposalStatus(admin, proposal.id, "escalated", null);
    await logToLedger(admin, proposal, "proposal_escalated", {
      step: "conflict_detection",
      reason: "escalate_action",
    });
    return {
      proposal_id: proposal.id,
      status: "escalated",
      decline_reason: null,
      routed: false,
    };
  }

  // ── Step 3: Relevance Scoring ──
  const relevanceScore = scoreRelevance(proposal);
  if (relevanceScore < RELEVANCE_THRESHOLD) {
    const reason = `low_relevance: score ${relevanceScore.toFixed(2)} below threshold ${RELEVANCE_THRESHOLD}`;
    await updateProposalStatus(admin, proposal.id, "declined", reason);
    await logToLedger(admin, proposal, "proposal_declined", {
      reason,
      step: "relevance_scoring",
      score: relevanceScore,
    });
    return {
      proposal_id: proposal.id,
      status: "declined",
      decline_reason: reason,
      routed: false,
    };
  }

  // ── Step 4: Merge ──
  await mergeProposal(admin, proposal);
  await updateProposalStatus(admin, proposal.id, "accepted", null);
  await logToLedger(admin, proposal, "proposal_accepted", {
    step: "merge",
    relevance_score: relevanceScore,
    conflict_info: conflict.reason,
  });

  // ── Step 5: Route ──
  const routed = await routeAfterAccept(admin, proposal);

  return {
    proposal_id: proposal.id,
    status: "accepted",
    decline_reason: null,
    routed,
  };
}

/**
 * Step 1: Validate the proposal has a valid schema.
 */
function validateSchema(proposal: Proposal): string | null {
  if (!proposal.account_id) {
    return "missing_account_id";
  }

  if (!proposal.source_app) {
    return "missing_source_app";
  }

  if (!VALID_LAYERS.includes(proposal.target_layer)) {
    return `invalid_target_layer: ${proposal.target_layer}`;
  }

  if (!proposal.payload || typeof proposal.payload !== "object") {
    return "invalid_payload: must be a non-null object";
  }

  if (Object.keys(proposal.payload).length === 0) {
    return "empty_payload";
  }

  const validFields = LAYER_FIELDS[proposal.target_layer];
  const payloadFields = Object.keys(proposal.payload);

  // Reject unknown fields that don't belong to this layer
  const unknownFields = payloadFields.filter((f) => !validFields.includes(f));
  if (unknownFields.length > 0) {
    return `unknown_payload_fields: [${unknownFields.join(", ")}] are not valid for layer '${proposal.target_layer}'. Allowed: [${validFields.join(", ")}]`;
  }

  // Check that at least one field is present (already guaranteed by empty check above,
  // but kept for clarity)
  const hasValidField = payloadFields.some((f) => validFields.includes(f));
  if (!hasValidField) {
    return `invalid_payload_fields: none of [${payloadFields.join(", ")}] are valid for layer '${proposal.target_layer}'`;
  }

  return null;
}

/**
 * Step 3: Score the relevance of a proposal based on evidence quality.
 */
function scoreRelevance(proposal: Proposal): number {
  let score = 0;

  // Base score from confidence level
  const confidenceScores = { validated: 0.5, inferred: 0.3, speculative: 0.1 };
  score += confidenceScores[proposal.confidence] ?? 0;

  const evidence = proposal.evidence ?? [];

  if (evidence.length === 0) {
    // No evidence - only validated proposals pass without evidence
    return proposal.confidence === "validated" ? 0.5 : 0.1;
  }

  // Evidence count factor (diminishing returns, max +0.2)
  score += Math.min(evidence.length * 0.05, 0.2);

  // Evidence type diversity factor (max +0.15)
  const uniqueTypes = new Set(evidence.map((e) => e.type));
  score += Math.min(uniqueTypes.size * 0.05, 0.15);

  // Recency factor (max +0.15)
  const now = Date.now();
  const recentEvidence = evidence.filter((e) => {
    if (!e.date) return false;
    const age = now - new Date(e.date).getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    return age < thirtyDays;
  });
  if (recentEvidence.length > 0) {
    score += 0.15 * (recentEvidence.length / evidence.length);
  }

  return Math.min(score, 1);
}

/**
 * Step 4: Merge the proposal payload into the Context Structure layer.
 */
async function mergeProposal(
  admin: SupabaseClient,
  proposal: Proposal
): Promise<void> {
  const tableName = `kinetiks_context_${proposal.target_layer}`;

  const { data: existing, error: selectError } = await admin
    .from(tableName)
    .select("data")
    .eq("account_id", proposal.account_id)
    .single();

  // PGRST116 = no rows, which is fine (we'll insert)
  if (selectError && selectError.code !== "PGRST116") {
    throw new Error(
      `Failed to read ${tableName} for merge: ${selectError.message}`
    );
  }

  const existingData = (existing?.data as Record<string, unknown>) ?? {};

  let mergedData: Record<string, unknown>;

  if (proposal.action === "add") {
    mergedData = deepMerge(existingData, proposal.payload);
  } else {
    mergedData = { ...existingData, ...proposal.payload };
  }

  const source = `synapse:${proposal.source_app}`;

  if (existing) {
    const { error: updateError } = await admin
      .from(tableName)
      .update({
        data: mergedData,
        source,
        source_detail: proposal.source_operator ?? proposal.source_app,
        updated_at: new Date().toISOString(),
      })
      .eq("account_id", proposal.account_id);

    if (updateError) {
      throw new Error(
        `Failed to update ${tableName}: ${updateError.message}`
      );
    }
  } else {
    const { error: insertError } = await admin
      .from(tableName)
      .insert({
        account_id: proposal.account_id,
        data: mergedData,
        source,
        source_detail: proposal.source_operator ?? proposal.source_app,
      });

    if (insertError) {
      throw new Error(
        `Failed to insert into ${tableName}: ${insertError.message}`
      );
    }
  }
}

/**
 * Step 5: After accepting a proposal, create routing events for relevant Synapses.
 * Returns true if any routing events were created.
 * Honors the 5-minute recency throttle per app+layer.
 */
async function routeAfterAccept(
  admin: SupabaseClient,
  proposal: Proposal
): Promise<boolean> {
  // Get all registered Synapses for this account, excluding the source app
  const { data: synapses, error: synapseError } = await admin
    .from("kinetiks_synapses")
    .select("app_name, read_layers")
    .eq("account_id", proposal.account_id)
    .eq("status", "active")
    .neq("app_name", proposal.source_app);

  if (synapseError) {
    console.error(
      `Failed to fetch synapses for routing: ${synapseError.message}`
    );
    return false;
  }

  if (!synapses || synapses.length === 0) return false;

  // Filter to Synapses that have read access to the affected layer
  const relevantSynapses = synapses.filter((s) => {
    const readLayers = s.read_layers as string[];
    return readLayers.includes(proposal.target_layer);
  });

  if (relevantSynapses.length === 0) return false;

  // Apply recency throttle: skip synapses that received this layer recently
  const throttleWindow = new Date(
    Date.now() - RECENCY_THROTTLE_MS
  ).toISOString();

  const unthrottledSynapses = [];
  for (const synapse of relevantSynapses) {
    const appName = synapse.app_name as string;
    const { count } = await admin
      .from("kinetiks_routing_events")
      .select("id", { count: "exact", head: true })
      .eq("account_id", proposal.account_id)
      .eq("target_app", appName)
      .gte("created_at", throttleWindow)
      .contains("payload", { layer: proposal.target_layer });

    if ((count ?? 0) === 0) {
      unthrottledSynapses.push(synapse);
    }
  }

  if (unthrottledSynapses.length === 0) return false;

  // Create routing events
  const routingEvents = unthrottledSynapses.map((synapse) => ({
    account_id: proposal.account_id,
    target_app: synapse.app_name,
    source_proposal_id: proposal.id,
    payload: {
      layer: proposal.target_layer,
      action: proposal.action,
      changes: proposal.payload,
      confidence: proposal.confidence,
    },
    relevance_note: `${proposal.target_layer} ${proposal.action} from ${proposal.source_app}`,
  }));

  const { error: routeInsertError } = await admin
    .from("kinetiks_routing_events")
    .insert(routingEvents);

  if (routeInsertError) {
    console.error(
      `Failed to insert routing events: ${routeInsertError.message}`
    );
    return false;
  }

  // Log routing (batched insert)
  const ledgerEntries = routingEvents.map((event) => ({
    account_id: proposal.account_id,
    event_type: "routing_sent",
    source_app: proposal.source_app,
    target_layer: proposal.target_layer,
    detail: {
      target_app: event.target_app,
      proposal_id: proposal.id,
    },
  }));
  await admin.from("kinetiks_ledger").insert(ledgerEntries);

  return true;
}

/**
 * Update the proposal status in the database.
 */
async function updateProposalStatus(
  admin: SupabaseClient,
  proposalId: string,
  status: ProposalStatus,
  declineReason: string | null
): Promise<void> {
  const { error } = await admin
    .from("kinetiks_proposals")
    .update({
      status,
      decline_reason: declineReason,
      evaluated_at: new Date().toISOString(),
      evaluated_by: "cortex",
    })
    .eq("id", proposalId);

  if (error) {
    throw new Error(
      `Failed to update proposal ${proposalId} status: ${error.message}`
    );
  }
}

/**
 * Log an event to the Learning Ledger.
 */
async function logToLedger(
  admin: SupabaseClient,
  proposal: Proposal,
  eventType: string,
  detail: Record<string, unknown>
): Promise<void> {
  await admin.from("kinetiks_ledger").insert({
    account_id: proposal.account_id,
    event_type: eventType,
    source_app: proposal.source_app,
    source_operator: proposal.source_operator,
    target_layer: proposal.target_layer,
    detail: {
      proposal_id: proposal.id,
      ...detail,
    },
  });
}

/**
 * Deep merge two objects. Arrays are concatenated and deduped by JSON stringification.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (sourceVal === null || sourceVal === undefined) continue;

    if (Array.isArray(sourceVal) && Array.isArray(targetVal)) {
      // Concat + dedupe arrays
      const combined = [...targetVal, ...sourceVal];
      const seen = new Set<string>();
      result[key] = combined.filter((item) => {
        const serialized = JSON.stringify(item);
        if (seen.has(serialized)) return false;
        seen.add(serialized);
        return true;
      });
    } else if (
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal) &&
      targetVal !== null
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      );
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}
