import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ContextLayer } from "@kinetiks/types";
import { NextResponse } from "next/server";

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
 * Auth: user session OR Authorization: Bearer {INTERNAL_SERVICE_SECRET}
 * Body: { account_id: string, app_name: string, layers: ContextLayer[] }
 */
export async function POST(request: Request) {
  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  const authHeader = request.headers.get("authorization");
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  const isServiceCall =
    !!internalSecret && authHeader === `Bearer ${internalSecret}`;

  if ((authError || !user) && !isServiceCall) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PullRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { account_id, app_name, layers } = body;

  if (!account_id || typeof account_id !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid account_id" },
      { status: 400 }
    );
  }

  if (!app_name || typeof app_name !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid app_name" },
      { status: 400 }
    );
  }

  if (!Array.isArray(layers) || layers.length === 0) {
    return NextResponse.json(
      { error: "layers must be a non-empty array" },
      { status: 400 }
    );
  }

  const invalidLayers = layers.filter(
    (l) => !VALID_LAYERS.includes(l as ContextLayer)
  );
  if (invalidLayers.length > 0) {
    return NextResponse.json(
      { error: `Invalid layers: ${invalidLayers.join(", ")}` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // If user-authenticated, verify they own this account
  if (!isServiceCall && user) {
    const { data: account } = await admin
      .from("kinetiks_accounts")
      .select("id")
      .eq("id", account_id)
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json(
        { error: "Forbidden: account does not belong to you" },
        { status: 403 }
      );
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
    return NextResponse.json(
      { error: `No Synapse found for app '${app_name}' on this account` },
      { status: 404 }
    );
  }

  if (synapse.status !== "active") {
    return NextResponse.json(
      { error: `Synapse for '${app_name}' is not active (status: ${synapse.status})` },
      { status: 403 }
    );
  }

  const readLayers = synapse.read_layers as string[];
  const unauthorizedLayers = layers.filter((l) => !readLayers.includes(l));
  if (unauthorizedLayers.length > 0) {
    return NextResponse.json(
      {
        error: `Synapse '${app_name}' does not have read access to: ${unauthorizedLayers.join(", ")}`,
      },
      { status: 403 }
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

  return NextResponse.json({ layers: result });
}
