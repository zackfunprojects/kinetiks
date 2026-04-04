import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * GET /api/identity
 * Get system identity for the account (excludes credentials).
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  // Select only safe fields - never expose email_credentials
  const { data: identity } = await admin
    .from("kinetiks_system_identity")
    .select("id, account_id, email_provider, email_address, slack_workspace_id, slack_bot_user_id, slack_channels, calendar_connected, created_at, updated_at")
    .eq("account_id", auth.account_id)
    .single();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("system_name, kinetiks_connected")
    .eq("id", auth.account_id)
    .single();

  return apiSuccess({
    system_name: account?.system_name ?? null,
    kinetiks_connected: account?.kinetiks_connected ?? false,
    identity: identity ?? null,
  });
}

// Allowed fields for identity upsert
const ALLOWED_FIELDS = new Set([
  "email_provider",
  "email_address",
  "slack_workspace_id",
  "slack_bot_user_id",
  "slack_channels",
  "calendar_connected",
]);

/**
 * POST /api/identity
 * Create or update system identity. Only allow-listed fields accepted.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  // Allow-list fields to prevent overwriting account_id or credentials via raw payload
  const safeUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(key)) {
      safeUpdates[key] = value;
    }
  }

  const admin = createAdminClient();

  const { error: upsertError } = await admin
    .from("kinetiks_system_identity")
    .upsert(
      {
        account_id: auth.account_id,
        ...safeUpdates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" }
    );

  if (upsertError) {
    return apiError(`Failed to update identity: ${upsertError.message}`, 500);
  }

  return apiSuccess({ updated: true });
}
