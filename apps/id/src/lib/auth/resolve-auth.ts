import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashApiKey, isKineticsApiKey } from "./api-keys";
import type { AuthenticatedContext, ApiKeyPermission } from "@kinetiks/types";

/**
 * Resolve authentication from a request.
 * Checks (in order):
 * 1. Bearer kntk_* API key in Authorization header
 * 2. INTERNAL_SERVICE_SECRET for Edge Function / CRON calls
 * 3. Supabase session cookie
 *
 * Returns AuthenticatedContext or null if not authenticated.
 */
export async function resolveAuth(
  request: Request
): Promise<AuthenticatedContext | null> {
  const authHeader = request.headers.get("authorization");

  // 1. Check for Kinetiks API key
  if (authHeader?.startsWith("Bearer kntk_")) {
    const apiKey = authHeader.slice(7); // Remove "Bearer "
    return resolveApiKey(apiKey);
  }

  // 2. Check for internal service secret (Edge Functions / CRONs)
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  if (internalSecret && authHeader === `Bearer ${internalSecret}`) {
    return {
      account_id: "__internal__",
      user_id: "__internal__",
      auth_method: "internal",
    };
  }

  // 3. Fall back to Supabase session cookie
  return resolveSession();
}

/**
 * Resolve a kntk_* API key to an AuthenticatedContext.
 */
async function resolveApiKey(
  key: string
): Promise<AuthenticatedContext | null> {
  if (!isKineticsApiKey(key)) {
    return null;
  }

  const keyHash = hashApiKey(key);
  const admin = createAdminClient();

  const { data: keyRecord, error } = await admin
    .from("kinetiks_api_keys")
    .select(
      "id, account_id, permissions, scope, rate_limit_per_minute, rate_limit_per_day, is_active, expires_at"
    )
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .single();

  if (error || !keyRecord) {
    return null;
  }

  // Check expiration
  if (
    keyRecord.expires_at &&
    new Date(keyRecord.expires_at as string) < new Date()
  ) {
    return null;
  }

  // Update last_used_at (fire-and-forget)
  admin
    .from("kinetiks_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRecord.id)
    .then(() => {});

  // Look up the user_id from the account
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("user_id")
    .eq("id", keyRecord.account_id)
    .single();

  if (!account) {
    return null;
  }

  return {
    account_id: keyRecord.account_id as string,
    user_id: account.user_id as string,
    auth_method: "api_key",
    key_id: keyRecord.id as string,
    permissions: keyRecord.permissions as ApiKeyPermission,
    scope: (keyRecord.scope as string[]) ?? [],
    rate_limit_per_minute: keyRecord.rate_limit_per_minute as number,
    rate_limit_per_day: keyRecord.rate_limit_per_day as number,
  };
}

/**
 * Resolve a Supabase session cookie to an AuthenticatedContext.
 */
async function resolveSession(): Promise<AuthenticatedContext | null> {
  const serverClient = createClient();
  const {
    data: { user },
    error,
  } = await serverClient.auth.getUser();

  if (error || !user) {
    return null;
  }

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return null;
  }

  return {
    account_id: account.id as string,
    user_id: user.id,
    auth_method: "session",
  };
}
