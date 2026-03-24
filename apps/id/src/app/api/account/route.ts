import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PATCH /api/account
 * Update account display_name
 * Body: { display_name: string }
 */
export async function PATCH(request: Request) {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { display_name } = body as { display_name: string };

  if (typeof display_name !== "string") {
    return NextResponse.json({ error: "Invalid display_name" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("kinetiks_accounts")
    .update({
      display_name: display_name.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/account
 * Delete account and all associated data
 */
export async function DELETE() {
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

  // Delete in order (respecting foreign keys)
  const accountId = account.id;
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
      return NextResponse.json(
        { error: `Failed to delete data from ${table}` },
        { status: 500 }
      );
    }
  }

  // Delete the account itself
  const { error: accountDeleteError } = await admin
    .from("kinetiks_accounts")
    .delete()
    .eq("id", accountId);

  if (accountDeleteError) {
    console.error("Failed to delete account:", accountDeleteError.message);
    return NextResponse.json(
      { error: "Failed to delete account record" },
      { status: 500 }
    );
  }

  // Only delete auth user after all DB deletions succeed
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(user.id);

  if (authDeleteError) {
    console.error("Failed to delete auth user:", authDeleteError.message);
    return NextResponse.json(
      { error: "Account data deleted but failed to remove auth user" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
