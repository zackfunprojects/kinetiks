import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateUniqueCodename } from "@/lib/utils/id-generator";
import { NextResponse } from "next/server";

export async function POST() {
  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Check if account already exists
  const { data: existing } = await admin
    .from("kinetiks_accounts")
    .select("id, codename")
    .eq("user_id", user.id)
    .single();

  if (existing) {
    return NextResponse.json({ account: existing });
  }

  // Generate unique codename
  const codename = await generateUniqueCodename(async (candidate) => {
    const { data } = await admin
      .from("kinetiks_accounts")
      .select("id")
      .eq("codename", candidate)
      .single();
    return !data;
  });

  const fromApp = user.user_metadata?.from_app ?? null;

  // Create account
  const { data: account, error: insertError } = await admin
    .from("kinetiks_accounts")
    .insert({
      user_id: user.id,
      codename,
      from_app: fromApp,
    })
    .select()
    .single();

  if (insertError) {
    // Handle unique constraint race: re-query to see if another request created it
    const { data: raceAccount } = await admin
      .from("kinetiks_accounts")
      .select("id, codename")
      .eq("user_id", user.id)
      .single();

    if (raceAccount) {
      return NextResponse.json({ account: raceAccount });
    }

    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }

  // Create initial confidence and billing records with error handling
  const { error: confidenceError } = await admin
    .from("kinetiks_confidence")
    .insert({ account_id: account.id });

  const { error: billingError } = await admin
    .from("kinetiks_billing")
    .insert({ account_id: account.id });

  if (confidenceError || billingError) {
    // Rollback: delete the partially-created account
    await admin
      .from("kinetiks_accounts")
      .delete()
      .eq("id", account.id);

    return NextResponse.json(
      { error: "Failed to initialize account records" },
      { status: 500 }
    );
  }

  // If from an app, create app activation
  if (fromApp) {
    await admin.from("kinetiks_app_activations").insert({
      account_id: account.id,
      app_name: fromApp,
    });
  }

  // Initialize empty context layers - use allSettled to detect individual failures
  const layers = [
    "kinetiks_context_org",
    "kinetiks_context_products",
    "kinetiks_context_voice",
    "kinetiks_context_customers",
    "kinetiks_context_narrative",
    "kinetiks_context_competitive",
    "kinetiks_context_market",
    "kinetiks_context_brand",
  ];

  const layerResults = await Promise.allSettled(
    layers.map((table) =>
      admin.from(table).insert({
        account_id: account.id,
        data: {},
        source: "system",
        source_detail: "account_creation",
      })
    )
  );

  const failedLayers = layerResults
    .map((r, i) => (r.status === "rejected" ? layers[i] : null))
    .filter(Boolean);

  if (failedLayers.length > 0) {
    console.error(
      `Failed to initialize context layers for account ${account.id}:`,
      failedLayers
    );
  }

  // Log to ledger
  await admin.from("kinetiks_ledger").insert({
    account_id: account.id,
    event_type: "account_created",
    detail: { codename, from_app: fromApp },
  });

  return NextResponse.json({ account });
}
