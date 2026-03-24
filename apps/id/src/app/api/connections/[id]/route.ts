/**
 * GET    /api/connections/[id]  - Get a single connection (credentials stripped)
 * DELETE /api/connections/[id]  - Disconnect and remove a connection
 * PATCH  /api/connections/[id]  - Trigger a sync or update metadata
 */

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import {
  getConnectionById,
  deleteConnection,
  updateConnectionStatus,
} from "@/lib/connections";
import { runExtraction } from "@/lib/connections/extract";
import type { ConnectionPublic, ConnectionProvider } from "@kinetiks/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { id: connectionId } = await params;

  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const connection = await getConnectionById(admin, connectionId, auth.account_id);
  if (!connection) {
    return apiError("Connection not found", 404);
  }

  // Strip credentials before returning
  const publicConnection: ConnectionPublic = {
    id: connection.id,
    account_id: connection.account_id,
    provider: connection.provider,
    status: connection.status,
    last_sync_at: connection.last_sync_at,
    metadata: connection.metadata,
    created_at: connection.created_at,
  };

  return apiSuccess({ connection: publicConnection });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { id: connectionId } = await params;

  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const connection = await getConnectionById(admin, connectionId, auth.account_id);
  if (!connection) {
    return apiError("Connection not found", 404);
  }

  try {
    await deleteConnection(
      admin,
      connectionId,
      auth.account_id,
      connection.provider as ConnectionProvider
    );
    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error("Failed to delete connection:", err);
    return apiError("Failed to delete connection", 500);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id: connectionId } = await params;

  const { auth, error } = await requireAuth(request);
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

  const { action } = body as { action?: string };

  if (action !== "sync") {
    return apiError("Invalid action. Supported: 'sync'", 400);
  }

  const admin = createAdminClient();

  const connection = await getConnectionById(admin, connectionId, auth.account_id);
  if (!connection) {
    return apiError("Connection not found", 404);
  }

  // Block non-retryable statuses but allow "error" for manual retry
  if (connection.status !== "active" && connection.status !== "error") {
    return apiError(`Cannot sync a ${connection.status} connection`, 400);
  }

  // Check for in-progress sync via sync_started_at metadata
  const syncStartedAt = (connection.metadata as Record<string, unknown>)
    ?.sync_started_at as string | undefined;
  if (syncStartedAt) {
    const startedMs = new Date(syncStartedAt).getTime();
    const tenMinutes = 10 * 60 * 1000;
    // If a sync started less than 10 minutes ago, reject (still in progress or stale)
    if (Date.now() - startedMs < tenMinutes) {
      return apiError("A sync is already in progress. Please wait.", 429);
    }
  }

  // Rate limit: one sync per 5 minutes per connection (based on last successful sync)
  if (connection.last_sync_at) {
    const lastSync = new Date(connection.last_sync_at).getTime();
    const fiveMinutes = 5 * 60 * 1000;
    if (Date.now() - lastSync < fiveMinutes) {
      return apiError("Rate limited. Please wait 5 minutes between syncs.", 429);
    }
  }

  try {
    // Set sync_started_at flag and reset status to active for error retries
    await admin
      .from("kinetiks_connections")
      .update({
        status: "active",
        metadata: {
          ...(connection.metadata as Record<string, unknown>),
          sync_started_at: new Date().toISOString(),
        },
      })
      .eq("id", connectionId);

    const result = await runExtraction(admin, connection, auth.account_id);

    // Clear sync_started_at on completion
    await admin
      .from("kinetiks_connections")
      .update({
        metadata: {
          ...(connection.metadata as Record<string, unknown>),
          sync_started_at: null,
        },
      })
      .eq("id", connectionId);

    return apiSuccess({ result });
  } catch (err) {
    // Clear sync_started_at on failure
    await admin
      .from("kinetiks_connections")
      .update({
        metadata: {
          ...(connection.metadata as Record<string, unknown>),
          sync_started_at: null,
        },
      })
      .eq("id", connectionId)
      .then(() => {}, () => {});

    console.error("Sync failed:", err);
    return apiError("Sync failed", 500);
  }
}
