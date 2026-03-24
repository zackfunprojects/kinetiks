import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

const VALID_PROVIDERS = ["anthropic", "firecrawl", "pdl"];

/**
 * GET /api/account/api-keys
 * Returns which keys are set (boolean flags only, never actual keys)
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  // Check connections table for BYOK entries
  const { data: connections } = await admin
    .from("kinetiks_connections")
    .select("provider, status")
    .eq("account_id", auth.account_id)
    .in("provider", VALID_PROVIDERS);

  const keysSet: Record<string, boolean> = {
    anthropic: false,
    firecrawl: false,
    pdl: false,
  };

  for (const conn of connections ?? []) {
    if (VALID_PROVIDERS.includes(conn.provider)) {
      keysSet[conn.provider] = conn.status === "active";
    }
  }

  return apiSuccess({ keys_set: keysSet });
}

/**
 * POST /api/account/api-keys
 * Save/update a BYOK API key
 * Body: { provider: string; api_key: string }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const body = await request.json();
  const { provider, api_key } = body as { provider: string; api_key: string };

  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return apiError("Invalid provider", 400);
  }

  if (!api_key || typeof api_key !== "string" || api_key.length < 8) {
    return apiError("Invalid API key", 400);
  }

  const admin = createAdminClient();

  // Encrypt and store as a connection
  const encryptionKey = process.env.KINETIKS_ENCRYPTION_KEY;
  let storedCredentials: Record<string, string>;

  if (encryptionKey) {
    // Use the existing encryption utility
    const { encryptCredentials } = await import("@/lib/connections/encryption");
    const encrypted = encryptCredentials({ api_key });
    storedCredentials = { encrypted: encrypted };
  } else {
    // Fallback for dev - store as-is (not recommended for production)
    storedCredentials = { api_key: api_key };
  }

  // Check for existing connection record
  const { data: existing, error: selectError } = await admin
    .from("kinetiks_connections")
    .select("id")
    .eq("account_id", auth.account_id)
    .eq("provider", provider)
    .maybeSingle();

  if (selectError) {
    console.error("Failed to check existing connection:", selectError.message);
    return apiError("Failed to save API key", 500);
  }

  if (existing) {
    const { error: updateError } = await admin
      .from("kinetiks_connections")
      .update({
        credentials: storedCredentials,
        status: "active",
        metadata: { type: "byok" },
      })
      .eq("id", existing.id);

    if (updateError) {
      console.error("Failed to update API key:", updateError.message);
      return apiError("Failed to update API key", 500);
    }
  } else {
    const { error: insertError } = await admin
      .from("kinetiks_connections")
      .insert({
        account_id: auth.account_id,
        provider,
        status: "active",
        credentials: storedCredentials,
        metadata: { type: "byok" },
      });

    if (insertError) {
      console.error("Failed to insert API key:", insertError.message);
      return apiError("Failed to save API key", 500);
    }
  }

  return apiSuccess({ saved: true });
}
