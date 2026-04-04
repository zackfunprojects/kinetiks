import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * GET /api/identity
 * Get system identity for the account.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const { data: identity } = await admin
    .from("kinetiks_system_identity")
    .select("*")
    .eq("account_id", auth.account_id)
    .single();

  // Also get system_name from accounts
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

/**
 * POST /api/identity
 * Create or update system identity.
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

  const admin = createAdminClient();

  // Upsert system identity
  const { error: upsertError } = await admin
    .from("kinetiks_system_identity")
    .upsert(
      {
        account_id: auth.account_id,
        ...body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" }
    );

  if (upsertError) {
    return apiError("Failed to update identity", 500);
  }

  return apiSuccess({ updated: true });
}
