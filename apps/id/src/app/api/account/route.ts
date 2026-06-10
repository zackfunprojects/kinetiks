import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { captureException } from "@/lib/observability/sentry";

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
    return apiError(`Failed to update account: ${updateError.message}`, 500);
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
    if (table === "kinetiks_ledger") {
      // The Learning Ledger is append-only (immutability trigger). Full
      // account erasure is the one path allowed to delete its rows, and
      // it must go through the guarded RPC that sets the transaction-local
      // opt-in flag; a raw delete is rejected by the trigger.
      const { error: eraseError } = await admin.rpc(
        "kinetiks_erase_account_ledger",
        { p_account_id: accountId },
      );
      if (eraseError) {
        await captureException(eraseError, {
          tags: { route: "/api/account", action: "delete_account", stage: "erase_ledger", app: "id" },
          user: { id: accountId },
          extra: { table: "kinetiks_ledger" },
        });
        return apiError("Failed to delete data from kinetiks_ledger", 500);
      }
      continue;
    }

    const { error: deleteError } = await admin
      .from(table)
      .delete()
      .eq("account_id", accountId);

    if (deleteError) {
      await captureException(deleteError, {
        tags: { route: "/api/account", action: "delete_account", stage: "delete_table", app: "id" },
        user: { id: accountId },
        extra: { table },
      });
      return apiError(`Failed to delete data from ${table}`, 500);
    }
  }

  // Delete the account itself
  const { error: accountDeleteError } = await admin
    .from("kinetiks_accounts")
    .delete()
    .eq("id", accountId);

  if (accountDeleteError) {
    await captureException(accountDeleteError, {
      tags: { route: "/api/account", action: "delete_account", stage: "delete_account_row", app: "id" },
      user: { id: accountId },
    });
    return apiError("Failed to delete account record", 500);
  }

  // Only delete auth user after all DB deletions succeed
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(auth.user_id);

  if (authDeleteError) {
    await captureException(authDeleteError, {
      tags: { route: "/api/account", action: "delete_account", stage: "delete_auth_user", app: "id" },
      user: { id: accountId },
    });
    return apiError("Account data deleted but failed to remove auth user", 500);
  }

  return apiSuccess({ deleted: true });
}
