/**
 * GET    /api/connections/[id]  - Get a single connection (credentials stripped)
 * DELETE /api/connections/[id]  - Disconnect and remove a connection
 * PATCH  /api/connections/[id]  - Trigger a sync or update metadata
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
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

async function resolveAccount(
  userId: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<{ id: string } | null> {
  const { data } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", userId)
    .single();
  return data;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { id: connectionId } = await params;

  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const account = await resolveAccount(user.id, admin);
  if (!account) {
    return NextResponse.json(
      { error: "Kinetiks account not found" },
      { status: 404 }
    );
  }

  const connection = await getConnectionById(admin, connectionId, account.id);
  if (!connection) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
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

  return NextResponse.json({ connection: publicConnection });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { id: connectionId } = await params;

  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const account = await resolveAccount(user.id, admin);
  if (!account) {
    return NextResponse.json(
      { error: "Kinetiks account not found" },
      { status: 404 }
    );
  }

  const connection = await getConnectionById(admin, connectionId, account.id);
  if (!connection) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  try {
    await deleteConnection(
      admin,
      connectionId,
      account.id,
      connection.provider as ConnectionProvider
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete connection:", err);
    return NextResponse.json(
      { error: "Failed to delete connection" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id: connectionId } = await params;

  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action } = body as { action?: string };

  if (action !== "sync") {
    return NextResponse.json(
      { error: "Invalid action. Supported: 'sync'" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const account = await resolveAccount(user.id, admin);
  if (!account) {
    return NextResponse.json(
      { error: "Kinetiks account not found" },
      { status: 404 }
    );
  }

  const connection = await getConnectionById(admin, connectionId, account.id);
  if (!connection) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  // Block non-retryable statuses but allow "error" for manual retry
  if (connection.status !== "active" && connection.status !== "error") {
    return NextResponse.json(
      { error: `Cannot sync a ${connection.status} connection` },
      { status: 400 }
    );
  }

  // Check for in-progress sync via sync_started_at metadata
  const syncStartedAt = (connection.metadata as Record<string, unknown>)
    ?.sync_started_at as string | undefined;
  if (syncStartedAt) {
    const startedMs = new Date(syncStartedAt).getTime();
    const tenMinutes = 10 * 60 * 1000;
    // If a sync started less than 10 minutes ago, reject (still in progress or stale)
    if (Date.now() - startedMs < tenMinutes) {
      return NextResponse.json(
        { error: "A sync is already in progress. Please wait." },
        { status: 429 }
      );
    }
  }

  // Rate limit: one sync per 5 minutes per connection (based on last successful sync)
  if (connection.last_sync_at) {
    const lastSync = new Date(connection.last_sync_at).getTime();
    const fiveMinutes = 5 * 60 * 1000;
    if (Date.now() - lastSync < fiveMinutes) {
      return NextResponse.json(
        { error: "Rate limited. Please wait 5 minutes between syncs." },
        { status: 429 }
      );
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

    const result = await runExtraction(admin, connection, account.id);

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

    return NextResponse.json({ result });
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
    return NextResponse.json(
      { error: "Sync failed" },
      { status: 500 }
    );
  }
}
