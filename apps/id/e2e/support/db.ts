import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";

/**
 * Service-role test harness for the E2E backend lane. Seeds accounts + mints
 * kntk_ API keys directly (mirroring _kt_test_seed_account in the pgTAP suite
 * and apps/id/src/lib/auth/api-keys.ts), so the API-key specs drive real HTTP
 * with two real tenants. Never used by product code — tests only.
 */

export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "E2E harness needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (the local Supabase stack)."
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Fixed password for the browser lane — seeded users sign in through /login. */
export const E2E_PASSWORD = "e2e-Test-Password-123!";

export interface SeededAccount {
  accountId: string;
  userId: string;
  email: string;
  /** A kntk_ key with read-write permission, ready for Authorization: Bearer. */
  apiKey: string;
  /** Password for UI sign-in (the browser lane). */
  password: string;
}

/** kntk_ key generation, byte-for-byte identical to lib/auth/api-keys.ts. */
function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `kntk_${randomBytes(30).toString("base64url")}`;
  const hash = createHash("sha256").update(key).digest("hex");
  return { key, hash, prefix: key.slice(0, 12) };
}

/** Create an auth user + kinetiks_account + a read-write API key. */
export async function seedAccount(
  admin: SupabaseClient,
  codename: string,
  permissions: "read-only" | "read-write" | "admin" = "read-write"
): Promise<SeededAccount> {
  const email = `e2e+${randomUUID()}@example.test`;
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password: E2E_PASSWORD,
    email_confirm: true,
  });
  if (userErr || !created.user) {
    throw new Error(`seedAccount: createUser failed: ${userErr?.message}`);
  }
  const userId = created.user.id;

  const { data: account, error: accErr } = await admin
    .from("kinetiks_accounts")
    .insert({
      user_id: userId,
      codename,
      display_name: codename,
      onboarding_complete: true,
    })
    .select("id")
    .single();
  if (accErr || !account) {
    throw new Error(`seedAccount: account insert failed: ${accErr?.message}`);
  }
  const accountId = account.id as string;

  const { key, hash, prefix } = generateApiKey();
  const { error: keyErr } = await admin.from("kinetiks_api_keys").insert({
    account_id: accountId,
    key_hash: hash,
    key_prefix: prefix,
    name: `e2e-${codename}`,
    permissions,
  });
  if (keyErr) {
    throw new Error(`seedAccount: api key insert failed: ${keyErr.message}`);
  }

  return { accountId, userId, email, apiKey: key, password: E2E_PASSWORD };
}

/** Tear down a seeded account (cascades to api keys, annotations, etc.). */
export async function deleteAccount(admin: SupabaseClient, account: SeededAccount): Promise<void> {
  // kinetiks_accounts FK-cascades to its dependents; remove it then the auth user.
  await admin.from("kinetiks_accounts").delete().eq("id", account.accountId);
  await admin.auth.admin.deleteUser(account.userId).catch(() => {
    // Best-effort: a missing user on teardown is not a test failure.
  });
}

/** Direct row read for assertions the HTTP surface does not expose. */
export async function rowsForThread(
  admin: SupabaseClient,
  table: "kinetiks_annotations" | "kinetiks_active_tasks" | "kinetiks_workspace_actions",
  accountId: string,
  threadId: string
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await admin
    .from(table)
    .select("id, account_id, thread_id")
    .eq("account_id", accountId)
    .eq("thread_id", threadId);
  if (error) throw new Error(`rowsForThread(${table}): ${error.message}`);
  return data ?? [];
}
