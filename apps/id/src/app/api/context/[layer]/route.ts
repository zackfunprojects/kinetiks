import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalculateConfidence } from "@/lib/cortex/confidence";
import { validateLayerData } from "@/lib/utils/context-validator";
import type { ContextLayer } from "@kinetiks/types";

const VALID_LAYERS: ContextLayer[] = [
  "org", "products", "voice", "customers",
  "narrative", "competitive", "market", "brand",
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ layer: string }> }
) {
  const { layer: layerParam } = await params;

  if (!VALID_LAYERS.includes(layerParam as ContextLayer)) {
    return NextResponse.json({ error: "Invalid layer" }, { status: 400 });
  }

  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const { data: row } = await admin
    .from(`kinetiks_context_${layerParam}`)
    .select("data, source, source_detail, confidence_score, updated_at")
    .eq("account_id", account.id)
    .single();

  return NextResponse.json({ data: row });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ layer: string }> }
) {
  const { layer: layerParam } = await params;

  if (!VALID_LAYERS.includes(layerParam as ContextLayer)) {
    return NextResponse.json({ error: "Invalid layer" }, { status: 400 });
  }

  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { data: newData } = body as { data: Record<string, unknown> };

  if (!newData || typeof newData !== "object" || Array.isArray(newData)) {
    return NextResponse.json({ error: "Missing or invalid data" }, { status: 400 });
  }

  const validation = validateLayerData(layerParam as ContextLayer, newData);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Invalid data for layer", details: validation.errors },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const tableName = `kinetiks_context_${layerParam}`;

  // Read existing data and merge (preserve fields not in the update)
  const { data: existingRow, error: readError } = await admin
    .from(tableName)
    .select("data")
    .eq("account_id", account.id)
    .maybeSingle();

  if (readError) {
    console.error(`Failed to read ${tableName} for account ${account.id}:`, readError.message);
    return NextResponse.json(
      { error: "Failed to read existing context data" },
      { status: 500 }
    );
  }

  const existingData = (existingRow?.data as Record<string, unknown>) || {};
  const mergedData = { ...existingData, ...newData };

  // Upsert the merged context data
  const { error: upsertError } = await admin
    .from(tableName)
    .upsert(
      {
        account_id: account.id,
        data: mergedData,
        source: "user_explicit",
        source_detail: "context_editor",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" }
    );

  if (upsertError) {
    return NextResponse.json(
      { error: "Failed to save context data" },
      { status: 500 }
    );
  }

  // Log to ledger and recalculate confidence (non-blocking - upsert already succeeded)
  let layerConfidence: number | undefined;

  const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
    account_id: account.id,
    event_type: "user_edit",
    target_layer: layerParam,
    detail: {
      action: "context_edited",
      layer: layerParam,
      fields_updated: Object.keys(newData),
    },
  });
  if (ledgerError) {
    console.error(`Ledger insert failed for ${layerParam} (account ${account.id}):`, ledgerError.message);
  }

  try {
    const confidence = await recalculateConfidence(admin, account.id);
    layerConfidence = confidence[layerParam as ContextLayer];
  } catch (e) {
    console.error(`Confidence recalculation failed for account ${account.id}:`, e);
  }

  return NextResponse.json({
    success: true,
    confidence: layerConfidence,
  });
}
