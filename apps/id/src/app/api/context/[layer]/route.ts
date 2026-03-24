import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalculateConfidence } from "@/lib/cortex/confidence";
import { validateLayerData } from "@/lib/utils/context-validator";
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

  const validation = validateLayerData(layerParam as ContextLayer, newData);
  if (!validation.valid) {
    return apiError("Invalid data for layer", 400, validation.errors);
  }

  const admin = createAdminClient();

  const tableName = `kinetiks_context_${layerParam}`;

  // Read existing data and merge (preserve fields not in the update)
  const { data: existingRow, error: readError } = await admin
    .from(tableName)
    .select("data")
    .eq("account_id", auth.account_id)
    .maybeSingle();

  if (readError) {
    console.error(`Failed to read ${tableName} for account ${auth.account_id}:`, readError.message);
    return apiError("Failed to read existing context data", 500);
  }

  const existingData = (existingRow?.data as Record<string, unknown>) || {};
  const mergedData = { ...existingData, ...newData };

  // Upsert the merged context data
  const { error: upsertError } = await admin
    .from(tableName)
    .upsert(
      {
        account_id: auth.account_id,
        data: mergedData,
        source: "user_explicit",
        source_detail: "context_editor",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" }
    );

  if (upsertError) {
    return apiError("Failed to save context data", 500);
  }

  // Log to ledger and recalculate confidence (non-blocking - upsert already succeeded)
  let layerConfidence: number | undefined;

  const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
    account_id: auth.account_id,
    event_type: "user_edit",
    target_layer: layerParam,
    detail: {
      action: "context_edited",
      layer: layerParam,
      fields_updated: Object.keys(newData),
    },
  });
  if (ledgerError) {
    console.error(`Ledger insert failed for ${layerParam} (account ${auth.account_id}):`, ledgerError.message);
  }

  void dispatchEvent(auth.account_id, "context.updated", {
    layer: layerParam,
    fields_updated: Object.keys(newData),
  });

  try {
    const confidence = await recalculateConfidence(admin, auth.account_id);
    layerConfidence = confidence[layerParam as ContextLayer];
  } catch (e) {
    console.error(`Confidence recalculation failed for account ${auth.account_id}:`, e);
  }

  return apiSuccess({
    updated: true,
    confidence: layerConfidence,
  });
}

/**
 * PATCH /api/context/{layer}
 * Partial update with deep merge (RFC 7386 JSON Merge Patch).
 * null values delete keys, nested objects merge recursively, arrays replace.
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

  const body = await request.json();
  const { data: patchData } = body as { data: Record<string, unknown> };

  if (!patchData || typeof patchData !== "object" || Array.isArray(patchData)) {
    return apiError("Missing or invalid data", 400);
  }

  const admin = createAdminClient();
  const tableName = `kinetiks_context_${layerParam}`;

  // Read existing data
  const { data: existingRow, error: readError } = await admin
    .from(tableName)
    .select("data")
    .eq("account_id", auth.account_id)
    .maybeSingle();

  if (readError) {
    console.error(`Failed to read ${tableName} for account ${auth.account_id}:`, readError.message);
    return apiError("Failed to read existing context data", 500);
  }

  const existingData = (existingRow?.data as Record<string, unknown>) || {};
  const mergedData = deepMerge(existingData, patchData);

  // Validate merged result
  const validation = validateLayerData(layerParam as ContextLayer, mergedData);
  if (!validation.valid) {
    return apiError("Merged data failed layer validation", 400, validation.errors);
  }

  const { error: upsertError } = await admin
    .from(tableName)
    .upsert(
      {
        account_id: auth.account_id,
        data: mergedData,
        source: "user_explicit",
        source_detail: "context_patch",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" }
    );

  if (upsertError) {
    return apiError("Failed to save context data", 500);
  }

  let layerConfidence: number | undefined;

  const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
    account_id: auth.account_id,
    event_type: "user_edit",
    target_layer: layerParam,
    detail: {
      action: "context_patched",
      layer: layerParam,
      fields_updated: Object.keys(patchData),
    },
  });
  if (ledgerError) {
    console.error(`Ledger insert failed for ${layerParam} (account ${auth.account_id}):`, ledgerError.message);
  }

  void dispatchEvent(auth.account_id, "context.updated", {
    layer: layerParam,
    fields_updated: Object.keys(patchData),
  });

  try {
    const confidence = await recalculateConfidence(admin, auth.account_id);
    layerConfidence = confidence[layerParam as ContextLayer];
  } catch (e) {
    console.error(`Confidence recalculation failed for account ${auth.account_id}:`, e);
  }

  return apiSuccess({
    updated: true,
    confidence: layerConfidence,
  });
}
