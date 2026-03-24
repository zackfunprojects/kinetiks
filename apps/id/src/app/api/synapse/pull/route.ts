import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import type { ContextLayer } from "@kinetiks/types";

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

interface PullRequest {
  account_id: string;
  app_name: string;
  layers: ContextLayer[];
}

/**
 * POST /api/synapse/pull
 *
 * Endpoint for app Synapses to pull Context Structure layers.
 * Returns only the layers the Synapse has read access to.
 *
 * Auth: user session, API key, or internal service secret
 * Body: { account_id: string, app_name: string, layers: ContextLayer[] }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { allowInternal: true });
  if (error) return error;

  let body: PullRequest;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const { account_id, app_name, layers } = body;

  if (!account_id || typeof account_id !== "string") {
    return apiError("Missing or invalid account_id", 400);
  }

  if (!app_name || typeof app_name !== "string") {
    return apiError("Missing or invalid app_name", 400);
  }

  if (!Array.isArray(layers) || layers.length === 0) {
    return apiError("layers must be a non-empty array", 400);
  }

  const invalidLayers = layers.filter(
    (l) => !VALID_LAYERS.includes(l as ContextLayer)
  );
  if (invalidLayers.length > 0) {
    return apiError(`Invalid layers: ${invalidLayers.join(", ")}`, 400);
  }

  const admin = createAdminClient();

  // For API key auth, enforce the key's account matches the requested account
  if (auth.auth_method !== "internal" && account_id !== auth.account_id) {
    return apiError("Forbidden: account mismatch", 403);
  }

  // Verify account ownership via user_id (covers session auth where
  // auth.account_id may differ from the requested account_id)
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

  // Verify Synapse exists and is active
  const { data: synapse, error: synapseError } = await admin
    .from("kinetiks_synapses")
    .select("read_layers, status")
    .eq("account_id", account_id)
    .eq("app_name", app_name)
    .single();

  if (synapseError || !synapse) {
    return apiError(`No Synapse found for app '${app_name}' on this account`, 404);
  }

  if (synapse.status !== "active") {
    return apiError(`Synapse for '${app_name}' is not active (status: ${synapse.status})`, 403);
  }

  const readLayers = synapse.read_layers as string[];
  const unauthorizedLayers = layers.filter((l) => !readLayers.includes(l));
  if (unauthorizedLayers.length > 0) {
    return apiError(
      `Synapse '${app_name}' does not have read access to: ${unauthorizedLayers.join(", ")}`,
      403
    );
  }

  // Fetch each requested layer
  const result: Record<string, Record<string, unknown>> = {};

  for (const layer of layers) {
    const tableName = `kinetiks_context_${layer}`;
    const { data: row, error: fetchError } = await admin
      .from(tableName)
      .select("data, confidence_score, source, updated_at")
      .eq("account_id", account_id)
      .maybeSingle();

    if (fetchError) {
      console.error(
        `Failed to fetch ${tableName} for account ${account_id}:`,
        fetchError.message
      );
      result[layer] = {};
      continue;
    }

    result[layer] = row
      ? {
          data: row.data as Record<string, unknown>,
          confidence_score: row.confidence_score as number,
          source: row.source as string,
          updated_at: row.updated_at as string,
        }
      : {};
  }

  // Log to ledger (non-fatal)
  const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
    account_id,
    event_type: "synapse_pull",
    source_app: app_name,
    detail: {
      layers_requested: layers,
      layers_returned: Object.keys(result).filter(
        (k) => Object.keys(result[k]).length > 0
      ),
    },
  });

  if (ledgerError) {
    console.error(
      `Failed to log synapse_pull to ledger: ${ledgerError.message}`
    );
  }

  return apiSuccess({ layers: result });
}
