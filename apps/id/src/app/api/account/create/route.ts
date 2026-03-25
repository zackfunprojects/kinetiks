import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateUniqueCodename } from "@/lib/utils/id-generator";
import { generateApiKey } from "@/lib/auth/api-keys";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

export async function POST() {
  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return apiError("Unauthorized", 401);
  }

  const admin = createAdminClient();

  // Check if account already exists
  const { data: existing } = await admin
    .from("kinetiks_accounts")
    .select("id, codename")
    .eq("user_id", user.id)
    .single();

  if (existing) {
    return apiSuccess({ account: existing, bootstrap_key: null });
  }

  // Generate unique codename
  const codename = await generateUniqueCodename(async (candidate) => {
    const { data, error } = await admin
      .from("kinetiks_accounts")
      .select("id")
      .eq("codename", candidate)
      .maybeSingle();
    if (error) throw new Error(`Codename availability check failed: ${error.message}`);
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
      return apiSuccess({ account: raceAccount });
    }

    return apiError("Failed to create account", 500);
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
    const { error: rollbackError } = await admin
      .from("kinetiks_accounts")
      .delete()
      .eq("id", account.id);

    if (rollbackError) {
      console.error(
        `Rollback failed for account ${account.id}: ${rollbackError.message}`,
        { confidenceError, billingError }
      );
      return apiError("Failed to initialize account and rollback failed", 500);
    }

    return apiError("Failed to initialize account records", 500);
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
    .map((r, i) => {
      if (r.status === "rejected") return layers[i];
      // Supabase returns fulfilled promises with error field on failure
      if (r.status === "fulfilled" && r.value?.error) return layers[i];
      return null;
    })
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

  // Generate bootstrap API key for agent access
  let bootstrapKey: string | null = null;
  try {
    const { key, hash, prefix } = generateApiKey();
    const { error: keyError } = await admin.from("kinetiks_api_keys").insert({
      account_id: account.id,
      key_hash: hash,
      key_prefix: prefix,
      name: "Bootstrap Key",
      permissions: "read-write",
      scope: [],
      is_active: true,
    });

    if (!keyError) {
      bootstrapKey = key;
    } else {
      console.error(`Failed to create bootstrap key for ${account.id}:`, keyError.message);
    }
  } catch (err) {
    console.error(`Bootstrap key generation error for ${account.id}:`, err);
  }

  return apiSuccess({ account, bootstrap_key: bootstrapKey });
}
