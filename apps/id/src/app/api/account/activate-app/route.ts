import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_REGISTRY } from "@/lib/utils/app-registry";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const body = await request.json();
  const { app_name } = body as { app_name: string };

  if (!app_name || !APP_REGISTRY[app_name]) {
    return apiError("Invalid app name", 400);
  }

  const admin = createAdminClient();
  const appInfo = APP_REGISTRY[app_name];

  // Check if already activated
  const { data: existing, error: selectError } = await admin
    .from("kinetiks_app_activations")
    .select("id, status")
    .eq("account_id", auth.account_id)
    .eq("app_name", app_name)
    .maybeSingle();

  if (selectError) {
    console.error("Failed to check activation:", selectError.message);
    return apiError("Failed to check app status", 500);
  }

  if (existing) {
    if (existing.status === "active") {
      return apiError("App already active", 409);
    }
    // Reactivate
    const { error: updateError } = await admin
      .from("kinetiks_app_activations")
      .update({ status: "active", activated_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (updateError) {
      console.error("Failed to reactivate app:", updateError.message);
      return apiError("Failed to reactivate app", 500);
    }
  } else {
    // Create new activation
    const { error: insertError } = await admin
      .from("kinetiks_app_activations")
      .insert({
        account_id: auth.account_id,
        app_name,
        status: "active",
        activated_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error("Failed to activate app:", insertError.message);
      return apiError("Failed to activate app", 500);
    }
  }

  // Ensure synapse record exists
  const { data: existingSynapse, error: synapseSelectError } = await admin
    .from("kinetiks_synapses")
    .select("id")
    .eq("account_id", auth.account_id)
    .eq("app_name", app_name)
    .maybeSingle();

  if (synapseSelectError) {
    console.error("Failed to check synapse:", synapseSelectError.message);
    return apiError("Failed to check synapse status", 500);
  }

  if (!existingSynapse) {
    const { error: synapseInsertError } = await admin
      .from("kinetiks_synapses")
      .insert({
        account_id: auth.account_id,
        app_name,
        app_url: appInfo.url,
        status: "active",
        read_layers: appInfo.defaultReadLayers,
        write_layers: appInfo.defaultWriteLayers,
      });

    if (synapseInsertError) {
      console.error("Failed to create synapse:", synapseInsertError.message);
      return apiError("Failed to create synapse", 500);
    }
  }

  // Log to ledger (non-fatal)
  const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
    account_id: auth.account_id,
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

  return apiSuccess({ activated: true, app_name });
}
