/**
 * GET    /api/connections/[id]  - Get a single connection (public projection)
 * DELETE /api/connections/[id]  - Disconnect: revoke via Nango + flip local row
 * PATCH  /api/connections/[id]  - Trigger an on-demand sync via Nango
 *
 * Phase 7 — Nango Connect end-to-end.
 *
 * All three handlers go through Nango. The legacy in-house OAuth
 * sync path (`runExtraction`) is removed; sync triggering now calls
 * `nango.triggerSync()` and the sync webhook handler at
 * `/api/integrations/nango/webhook` writes the resulting data.
 */

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import {
  deleteConnection as nangoDeleteConnection,
  triggerSync,
} from "@/lib/integrations/nango/client";
import { getNangoProviderConfig } from "@/lib/integrations/nango/provider-config";
import type { ConnectionPublic, ConnectionProvider } from "@kinetiks/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ConnectionRow {
  id: string;
  account_id: string;
  provider: string;
  status: string;
  nango_connection_id: string | null;
  nango_provider_config_key: string | null;
  last_sync_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

async function fetchConnectionByIdAndAccount(args: {
  admin: ReturnType<typeof createAdminClient>;
  id: string;
  account_id: string;
}): Promise<ConnectionRow | null> {
  const { data, error } = await args.admin
    .from("kinetiks_connections")
    .select(
      "id, account_id, provider, status, nango_connection_id, nango_provider_config_key, last_sync_at, metadata, created_at",
    )
    .eq("id", args.id)
    .eq("account_id", args.account_id)
    .maybeSingle();
  if (error) {
    console.error(
      `[api/connections/[id]] fetch failed for ${args.id}: ${error.message}`,
    );
    return null;
  }
  return (data as ConnectionRow | null) ?? null;
}

export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const { id: connectionId } = await params;
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const connection = await fetchConnectionByIdAndAccount({
    admin,
    id: connectionId,
    account_id: auth.account_id,
  });
  if (!connection) return apiError("Connection not found", 404);

  const publicConnection: ConnectionPublic = {
    id: connection.id,
    account_id: connection.account_id,
    provider: connection.provider as ConnectionProvider,
    status: connection.status as ConnectionPublic["status"],
    last_sync_at: connection.last_sync_at,
    metadata: connection.metadata ?? {},
    created_at: connection.created_at,
  };
  return apiSuccess({ connection: publicConnection });
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  const { id: connectionId } = await params;
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  const admin = createAdminClient();
  const connection = await fetchConnectionByIdAndAccount({
    admin,
    id: connectionId,
    account_id: auth.account_id,
  });
  if (!connection) return apiError("Connection not found", 404);
  if (connection.status === "revoked") {
    return apiSuccess({ deleted: true, already_revoked: true });
  }

  // Best-effort Nango revoke. We always flip our local row regardless
  // of the Nango outcome: if Nango fails (transient network issue,
  // already-deleted on their side), the customer's connection is
  // still revoked on our side. A `connection.deleted` webhook may
  // arrive later as confirmation; the auth handler treats that as
  // idempotent.
  let nangoOutcome: "deleted" | "skipped" | "failed" = "skipped";
  if (connection.nango_connection_id && connection.nango_provider_config_key) {
    try {
      await nangoDeleteConnection({
        connection_id: connection.nango_connection_id,
        provider_config_key: connection.nango_provider_config_key,
      });
      nangoOutcome = "deleted";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[api/connections/[id]] Nango deleteConnection failed for ${connection.nango_connection_id}: ${msg}`,
      );
      nangoOutcome = "failed";
      // Fall through and revoke locally anyway.
    }
  }

  const nowIso = new Date().toISOString();
  const { error: updateError } = await admin
    .from("kinetiks_connections")
    .update({
      status: "revoked",
      metadata: {
        ...(connection.metadata ?? {}),
        revoked_at: nowIso,
        revocation_reason: "customer_revoked",
        nango_delete_outcome: nangoOutcome,
      },
    })
    .eq("id", connectionId)
    .eq("account_id", auth.account_id);
  if (updateError) {
    console.error(
      `[api/connections/[id]] local revoke failed: ${updateError.message}`,
    );
    return apiError("Failed to revoke connection", 500);
  }

  // Emit the connection_revoked Ledger entry. Mirrors the pattern
  // from the auth webhook so both customer-initiated and Nango-
  // initiated revocations land in the Ledger uniformly.
  const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
    account_id: auth.account_id,
    event_type: "connection_revoked",
    source_app: "kinetiks_id",
    source_operator: "api.connections.delete",
    detail: {
      connection_id: connection.id,
      provider: connection.provider,
      nango_connection_id: connection.nango_connection_id,
      revocation_reason: "customer_revoked",
    },
  });
  if (ledgerError) {
    console.error(
      `[api/connections/[id]] ledger emit failed: ${ledgerError.message}`,
    );
    // Local row already revoked. Don't fail the request.
  }

  return apiSuccess({ deleted: true, nango_outcome: nangoOutcome });
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  const { id: connectionId } = await params;
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

  const action = body.action;
  if (action !== "sync") {
    return apiError("Invalid action. Supported: 'sync'", 400);
  }

  const admin = createAdminClient();
  const connection = await fetchConnectionByIdAndAccount({
    admin,
    id: connectionId,
    account_id: auth.account_id,
  });
  if (!connection) return apiError("Connection not found", 404);

  if (connection.status !== "active" && connection.status !== "error") {
    return apiError(`Cannot sync a ${connection.status} connection`, 400);
  }
  if (!connection.nango_connection_id || !connection.nango_provider_config_key) {
    return apiError(
      "Connection is missing Nango identifiers; reconnect required",
      409,
    );
  }

  // Rate limit: one manual sync per 5 minutes per connection.
  if (connection.last_sync_at) {
    const lastMs = new Date(connection.last_sync_at).getTime();
    if (Date.now() - lastMs < 5 * 60 * 1000) {
      return apiError("Rate limited. Please wait 5 minutes between manual syncs.", 429);
    }
  }

  const config = getNangoProviderConfig(connection.provider as ConnectionProvider);

  try {
    await triggerSync({
      connection_id: connection.nango_connection_id,
      provider_config_key: connection.nango_provider_config_key,
      sync_names: [...config.sync_names],
    });
    return apiSuccess({ triggered: true, sync_names: config.sync_names });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[api/connections/[id]] triggerSync failed for ${connection.nango_connection_id}: ${msg}`,
    );
    return apiError("Sync trigger failed", 500);
  }
}
