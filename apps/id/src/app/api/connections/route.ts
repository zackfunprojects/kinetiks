/**
 * GET  /api/connections     - List all connections for the authenticated user
 * POST /api/connections     - Mint a Nango Connect session token for the frontend
 *
 * Phase 7 — Nango Connect end-to-end.
 *
 * Replaces the legacy per-provider OAuth initiate path (deleted in this
 * phase). The new flow:
 *   1. Client POSTs { provider } to this route.
 *   2. We resolve (or mint) the customer's stable Nango end_user_id.
 *   3. We call `nango.createConnectSession({ end_user, allowed_integrations })`.
 *   4. We return `{ session_token }`; client opens `@nangohq/frontend`
 *      Connect modal with that token.
 *   5. Customer authorizes the provider inside the modal.
 *   6. Nango fires the `connection.created` webhook, which lands in
 *      apps/id/src/lib/integrations/nango/handlers/auth.ts and upserts
 *      the kinetiks_connections row.
 *
 * No more per-provider client_id / client_secret on our side. Nango
 * owns OAuth and the refresh-token chain.
 */

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { createConnectSession } from "@/lib/integrations/nango/client";
import { getNangoProviderConfig } from "@/lib/integrations/nango/provider-config";
import { isValidProvider } from "@/lib/connections/providers";
import { isSystemProvider } from "@/lib/connections/system-providers";
import type { AnyConnectionProvider, ConnectionProvider } from "@kinetiks/types";

interface ConnectionListRow {
  id: string;
  provider: AnyConnectionProvider;
  status: string;
  last_sync_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function GET(request: Request): Promise<Response> {
  const { auth, error } = await requireAuth(request, { permissions: "read-only" });
  if (error) return error;

  const admin = createAdminClient();

  const { data, error: queryError } = await admin
    .from("kinetiks_connections")
    .select("id, provider, status, last_sync_at, metadata, created_at")
    .eq("account_id", auth.account_id)
    .order("created_at", { ascending: false });

  if (queryError) {
    console.error(
      `[api/connections] list failed for account ${auth.account_id}: ${queryError.message}`,
    );
    return apiError("Failed to fetch connections", 500);
  }
  return apiSuccess({ connections: (data ?? []) as ConnectionListRow[] });
}

const GENERIC_CONNECT_ERROR =
  "We couldn't start the connect flow. Try again in a moment.";

export async function POST(request: Request): Promise<Response> {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const provider = body.provider;
  if (typeof provider === "string" && isSystemProvider(provider)) {
    // System connections (google_workspace / slack / calendar) use the
    // direct OAuth path, not Nango. D1.
    return apiError(
      `'${provider}' is a system connection. Start it at /api/connections/system/${provider}/start.`,
      400,
    );
  }
  if (typeof provider !== "string" || !isValidProvider(provider)) {
    return apiError("Missing or invalid 'provider' field", 400);
  }
  const providerKey = provider as ConnectionProvider;

  const admin = createAdminClient();

  // Reject duplicate connect attempts for an already-active connection.
  // Customers can have at most one active connection per provider; if
  // they want to re-auth, they disconnect first. The unique constraint
  // is enforced at the application layer here and at the auth
  // webhook's upsert step.
  const { data: existing, error: existingError } = await admin
    .from("kinetiks_connections")
    .select("id, status")
    .eq("account_id", auth.account_id)
    .eq("provider", providerKey)
    .neq("status", "revoked")
    .maybeSingle();
  if (existingError) {
    console.error(
      `[api/connections] existing check failed: ${existingError.message}`,
    );
    return apiError(GENERIC_CONNECT_ERROR, 500);
  }
  if (existing) {
    return apiError(`Already connected to ${providerKey}. Disconnect first.`, 409);
  }

  // Resolve the customer's stable Nango end_user_id. Set on first
  // connect; reused for every subsequent connect on this account.
  const { data: account, error: accountError } = await admin
    .from("kinetiks_accounts")
    .select("id, user_id, nango_end_user_id, codename")
    .eq("id", auth.account_id)
    .maybeSingle();
  if (accountError || !account) {
    console.error(
      `[api/connections] account lookup failed: ${accountError?.message ?? "not found"}`,
    );
    return apiError(GENERIC_CONNECT_ERROR, 500);
  }

  let endUserId = (account.nango_end_user_id as string | null) ?? null;
  if (!endUserId) {
    endUserId = `kt_${auth.account_id}`;
    const { error: updateError } = await admin
      .from("kinetiks_accounts")
      .update({ nango_end_user_id: endUserId })
      .eq("id", auth.account_id)
      .is("nango_end_user_id", null);
    if (updateError) {
      // Concurrent first-connect: another request set the id between
      // our SELECT and UPDATE. Re-fetch.
      const { data: retry } = await admin
        .from("kinetiks_accounts")
        .select("nango_end_user_id")
        .eq("id", auth.account_id)
        .maybeSingle();
      endUserId = (retry?.nango_end_user_id as string | null) ?? null;
      if (!endUserId) {
        console.error(
          `[api/connections] failed to set nango_end_user_id: ${updateError.message}`,
        );
        return apiError(GENERIC_CONNECT_ERROR, 500);
      }
    }
  }

  const config = getNangoProviderConfig(providerKey);

  try {
    const session = await createConnectSession({
      end_user: {
        id: endUserId,
        display_name: (account.codename as string | null) ?? undefined,
        // We do NOT pass user email to Nango — Nango forms can prompt
        // the customer for it where the provider requires it.
      },
      allowed_integrations: [config.nango_integration_id],
    });
    return apiSuccess({
      session_token: session.token,
      expires_at: session.expires_at,
      provider: providerKey,
      nango_integration_id: config.nango_integration_id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[api/connections] createConnectSession failed for ${providerKey}: ${msg}`,
    );
    return apiError(GENERIC_CONNECT_ERROR, 500);
  }
}
