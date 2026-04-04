import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * PATCH /api/account
 * Update account fields
 * Body: { display_name?: string, system_name?: string, kinetiks_connected?: boolean }
 */
export async function PATCH(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  const body = await request.json();
  const { display_name, system_name, kinetiks_connected } = body as {
    display_name?: string;
    system_name?: string;
    kinetiks_connected?: boolean;
  };

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof display_name === "string") {
    updates.display_name = display_name.trim() || null;
  }
  if (typeof system_name === "string") {
    updates.system_name = system_name.trim() || null;
  }
  if (typeof kinetiks_connected === "boolean") {
    updates.kinetiks_connected = kinetiks_connected;
  }

  if (Object.keys(updates).length <= 1) {
    return apiError("No valid fields to update", 400);
  }

  const admin = createAdminClient();

  const { error: updateError } = await admin
    .from("kinetiks_accounts")
    .update(updates)
    .eq("id", auth.account_id);

  if (updateError) {
    return apiError("Failed to update account", 500);
  }

  return apiSuccess({ updated: true });
}

/**
 * DELETE /api/account
 * Delete account and all associated data
 */
export async function DELETE(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  // Account deletion is too destructive for API keys - require session auth
  if (auth.auth_method !== "session") {
    return apiError("Account deletion requires session authentication", 403);
  }

  const admin = createAdminClient();

  // Delete in order (respecting foreign keys)
  const accountId = auth.account_id;
  const tables = [
    "kinetiks_marcus_messages",
    "kinetiks_marcus_follow_ups",
    "kinetiks_marcus_alerts",
    "kinetiks_marcus_schedules",
    "kinetiks_marcus_threads",
    "kinetiks_routing_events",
    "kinetiks_proposals",
    "kinetiks_ledger",
    "kinetiks_imports",
    "kinetiks_connections",
    "kinetiks_confidence",
    "kinetiks_synapses",
    "kinetiks_app_activations",
    "kinetiks_billing",
    "kinetiks_context_org",
    "kinetiks_context_products",
    "kinetiks_context_voice",
    "kinetiks_context_customers",
    "kinetiks_context_narrative",
    "kinetiks_context_competitive",
    "kinetiks_context_market",
    "kinetiks_context_brand",
  ];

  for (const table of tables) {
    const { error: deleteError } = await admin
      .from(table)
      .delete()
      .eq("account_id", accountId);

    if (deleteError) {
      console.error(`Failed to delete from ${table}:`, deleteError.message);
      return apiError(`Failed to delete data from ${table}`, 500);
    }
  }

  // Delete the account itself
  const { error: accountDeleteError } = await admin
    .from("kinetiks_accounts")
    .delete()
    .eq("id", accountId);

  if (accountDeleteError) {
    console.error("Failed to delete account:", accountDeleteError.message);
    return apiError("Failed to delete account record", 500);
  }

  // Only delete auth user after all DB deletions succeed
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(auth.user_id);

  if (authDeleteError) {
    console.error("Failed to delete auth user:", authDeleteError.message);
    return apiError("Account data deleted but failed to remove auth user", 500);
  }

  return apiSuccess({ deleted: true });
}
