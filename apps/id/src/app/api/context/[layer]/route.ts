import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateLayerData } from "@/lib/cortex";
import { submitContextEditProposal } from "@/lib/cortex/submit-context-edit";
import { deepMerge } from "@/lib/utils/deep-merge";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { dispatchEvent } from "@/lib/webhooks/deliver";
import type { ContextLayer } from "@kinetiks/types";

const VALID_LAYERS: ContextLayer[] = [
  "org", "products", "voice", "customers",
  "narrative", "competitive", "market", "brand",
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ layer: string }> }
) {
  const { layer: layerParam } = await params;

  if (!VALID_LAYERS.includes(layerParam as ContextLayer)) {
    return apiError("Invalid layer", 400);
  }

  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const { data: row } = await admin
    .from(`kinetiks_context_${layerParam}`)
    .select("data, source, source_detail, confidence_score, updated_at")
    .eq("account_id", auth.account_id)
    .single();

  return apiSuccess({ data: row });
}

/**
 * PUT /api/context/{layer}
 *
 * F3: user-explicit edits flow through the Proposal pipeline (Archivist
 * schema + conflict detection) and surface as an Approval audit card.
 * The Approval pipeline auto-approves for user-explicit edits with no
 * conflicts; conflicts escalate to a pending Approval card so the user
 * can confirm before committing.
 *
 * Direct upserts to `kinetiks_context_*` are forbidden — every change
 * is auditable via the Proposal + Approval + Insight chain.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ layer: string }> }
) {
  const { layer: layerParam } = await params;

  if (!VALID_LAYERS.includes(layerParam as ContextLayer)) {
    return apiError("Invalid layer", 400);
  }

  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") return apiError("Invalid JSON body", 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const { data: newData } = body as { data: Record<string, unknown> };

  if (!newData || typeof newData !== "object" || Array.isArray(newData)) {
    return apiError("Missing or invalid data", 400);
  }

  const layer = layerParam as ContextLayer;
  const validation = validateLayerData(layer, newData);
  if (!validation.valid) {
    return apiError("Invalid data for layer", 400, validation.errors);
  }

  const admin = createAdminClient();

  try {
    const result = await submitContextEditProposal(
      admin,
      auth.account_id,
      layer,
      newData,
      {
        source_app: "kinetiks_id",
        source_operator: "cortex_identity_editor",
        fields_updated: Object.keys(newData),
        content_length: JSON.stringify(newData).length,
      },
    );

    void dispatchEvent(auth.account_id, "context.updated", {
      layer,
      fields_updated: Object.keys(newData),
      outcome: result.outcome,
      proposal_id: result.proposal_id,
      approval_id: result.approval_id,
    });

    return apiSuccess({
      updated: result.outcome === "auto_applied",
      outcome: result.outcome,
      proposal_id: result.proposal_id,
      approval_id: result.approval_id,
      approval_status: result.approval_status,
      confidence: result.layer_confidence,
      decline_reason: result.decline_reason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return apiError(`Failed to submit context edit: ${message}`, 500);
  }
}

/**
 * PATCH /api/context/{layer}
 * Partial update with deep merge (RFC 7386 JSON Merge Patch).
 * Same Proposal → Approval pipeline as PUT.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ layer: string }> }
) {
  const { layer: layerParam } = await params;

  if (!VALID_LAYERS.includes(layerParam as ContextLayer)) {
    return apiError("Invalid layer", 400);
  }

  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") return apiError("Invalid JSON body", 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const { data: patchData } = body as { data: Record<string, unknown> };

  if (!patchData || typeof patchData !== "object" || Array.isArray(patchData)) {
    return apiError("Missing or invalid data", 400);
  }

  const layer = layerParam as ContextLayer;

  const admin = createAdminClient();

  // For PATCH we compute the merged data here so the Proposal payload
  // carries the full intended state. The evaluator does its own merge
  // semantically (shallow merge over current row), but PATCH callers
  // expect deep-merge semantics.
  const tableName = `kinetiks_context_${layer}`;
  const { data: existingRow, error: readError } = await admin
    .from(tableName)
    .select("data")
    .eq("account_id", auth.account_id)
    .maybeSingle();

  if (readError) {
    return apiError("Failed to read existing context data", 500);
  }

  const existingData = (existingRow?.data as Record<string, unknown>) || {};
  const mergedData = deepMerge(existingData, patchData);

  const validation = validateLayerData(layer, mergedData);
  if (!validation.valid) {
    return apiError("Merged data failed layer validation", 400, validation.errors);
  }

  try {
    const result = await submitContextEditProposal(
      admin,
      auth.account_id,
      layer,
      mergedData,
      {
        source_app: "kinetiks_id",
        source_operator: "cortex_identity_patch",
        fields_updated: Object.keys(patchData),
        content_length: JSON.stringify(patchData).length,
      },
    );

    void dispatchEvent(auth.account_id, "context.updated", {
      layer,
      fields_updated: Object.keys(patchData),
      outcome: result.outcome,
      proposal_id: result.proposal_id,
      approval_id: result.approval_id,
    });

    return apiSuccess({
      updated: result.outcome === "auto_applied",
      outcome: result.outcome,
      proposal_id: result.proposal_id,
      approval_id: result.approval_id,
      approval_status: result.approval_status,
      confidence: result.layer_confidence,
      decline_reason: result.decline_reason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return apiError(`Failed to submit context edit: ${message}`, 500);
  }
}
