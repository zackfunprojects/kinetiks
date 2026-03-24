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
  const { data: existing } = await admin
    .from("kinetiks_app_activations")
    .select("id, status")
    .eq("account_id", account.id)
    .eq("app_name", app_name)
    .single();

  if (existing) {
    if (existing.status === "active") {
      return NextResponse.json({ error: "App already active" }, { status: 409 });
    }
    // Reactivate
    await admin
      .from("kinetiks_app_activations")
      .update({ status: "active", activated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    // Create new activation
    await admin.from("kinetiks_app_activations").insert({
      account_id: account.id,
      app_name,
      status: "active",
    });
  }

  // Ensure synapse record exists
  const { data: existingSynapse } = await admin
    .from("kinetiks_synapses")
    .select("id")
    .eq("account_id", account.id)
    .eq("app_name", app_name)
    .single();

  if (!existingSynapse) {
    await admin.from("kinetiks_synapses").insert({
      account_id: account.id,
      app_name,
      app_url: appInfo.url,
      status: "active",
      read_layers: appInfo.defaultReadLayers,
      write_layers: appInfo.defaultWriteLayers,
    });
  }

  // Log to ledger
  await admin.from("kinetiks_ledger").insert({
    account_id: account.id,
    event_type: "import",
    detail: {
      action: "app_activated",
      app_name,
      display_name: appInfo.displayName,
    },
  });

  return NextResponse.json({ success: true, app_name });
}
