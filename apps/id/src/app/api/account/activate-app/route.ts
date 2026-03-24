import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_REGISTRY } from "@/lib/utils/app-registry";

export async function POST(request: Request) {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { app_name } = body as { app_name: string };

  if (!app_name || !APP_REGISTRY[app_name]) {
    return NextResponse.json({ error: "Invalid app name" }, { status: 400 });
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

  const appInfo = APP_REGISTRY[app_name];

  // Check if already activated
  const { data: existing, error: selectError } = await admin
    .from("kinetiks_app_activations")
    .select("id, status")
    .eq("account_id", account.id)
    .eq("app_name", app_name)
    .maybeSingle();

  if (selectError) {
    console.error("Failed to check activation:", selectError.message);
    return NextResponse.json({ error: "Failed to check app status" }, { status: 500 });
  }

  if (existing) {
    if (existing.status === "active") {
      return NextResponse.json({ error: "App already active" }, { status: 409 });
    }
    // Reactivate
    const { error: updateError } = await admin
      .from("kinetiks_app_activations")
      .update({ status: "active", activated_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (updateError) {
      console.error("Failed to reactivate app:", updateError.message);
      return NextResponse.json({ error: "Failed to reactivate app" }, { status: 500 });
    }
  } else {
    // Create new activation
    const { error: insertError } = await admin
      .from("kinetiks_app_activations")
      .insert({
        account_id: account.id,
        app_name,
        status: "active",
        activated_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error("Failed to activate app:", insertError.message);
      return NextResponse.json({ error: "Failed to activate app" }, { status: 500 });
    }
  }

  // Ensure synapse record exists
  const { data: existingSynapse, error: synapseSelectError } = await admin
    .from("kinetiks_synapses")
    .select("id")
    .eq("account_id", account.id)
    .eq("app_name", app_name)
    .maybeSingle();

  if (synapseSelectError) {
    console.error("Failed to check synapse:", synapseSelectError.message);
    return NextResponse.json({ error: "Failed to check synapse status" }, { status: 500 });
  }

  if (!existingSynapse) {
    const { error: synapseInsertError } = await admin
      .from("kinetiks_synapses")
      .insert({
        account_id: account.id,
        app_name,
        app_url: appInfo.url,
        status: "active",
        read_layers: appInfo.defaultReadLayers,
        write_layers: appInfo.defaultWriteLayers,
      });

    if (synapseInsertError) {
      console.error("Failed to create synapse:", synapseInsertError.message);
      return NextResponse.json({ error: "Failed to create synapse" }, { status: 500 });
    }
  }

  // Log to ledger (non-fatal)
  const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
    account_id: account.id,
    event_type: "app_activation",
    detail: {
      action: "app_activated",
      app_name,
      display_name: appInfo.displayName,
    },
  });

  if (ledgerError) {
    console.error("Failed to log activation:", ledgerError.message);
  }

  return NextResponse.json({ success: true, app_name });
}
