/**
 * Connection CRUD operations.
 *
 * All credential storage goes through the encryption layer.
 * All state changes are logged to the Learning Ledger.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConnectionProvider,
  ConnectionRecord,
  ConnectionPublic,
  ConnectionStatus,
  OAuthTokens,
} from "@kinetiks/types";
import { encryptCredentials, decryptCredentials } from "./encryption";
import { refreshAccessToken } from "./oauth";
import type { StoredCredentials, StoredOAuthCredentials } from "./types";

/**
 * Create a new connection record with encrypted credentials.
 */
export async function createConnection(
  admin: SupabaseClient,
  accountId: string,
  provider: ConnectionProvider,
  credentials: StoredCredentials,
  metadata: Record<string, unknown> = {}
): Promise<ConnectionRecord> {
  const encrypted = encryptCredentials(
    credentials as unknown as Record<string, unknown>
  );

  const { data, error } = await admin
    .from("kinetiks_connections")
    .insert({
      account_id: accountId,
      provider,
      status: "active",
      credentials: encrypted,
      last_sync_at: null,
      metadata,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create connection: ${error.message}`);
  }

  await logConnectionEvent(admin, accountId, "connection_created", {
    provider,
    connection_id: data.id,
  });

  return data as ConnectionRecord;
}

/**
 * Get all connections for an account with credentials stripped.
 */
export async function getConnections(
  admin: SupabaseClient,
  accountId: string
): Promise<ConnectionPublic[]> {
  const { data, error } = await admin
    .from("kinetiks_connections")
    .select(
      "id, account_id, provider, status, last_sync_at, metadata, created_at"
    )
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch connections: ${error.message}`);
  }

  return (data ?? []) as ConnectionPublic[];
}

/**
 * Get a single connection by provider for an account. Returns null if not found.
 */
export async function getConnectionByProvider(
  admin: SupabaseClient,
  accountId: string,
  provider: ConnectionProvider
): Promise<ConnectionRecord | null> {
  const { data, error } = await admin
    .from("kinetiks_connections")
    .select("*")
    .eq("account_id", accountId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch connection: ${error.message}`);
  }

  return (data as ConnectionRecord) ?? null;
}

/**
 * Get a single connection by ID. Returns null if not found.
 */
export async function getConnectionById(
  admin: SupabaseClient,
  connectionId: string,
  accountId: string
): Promise<ConnectionRecord | null> {
  const { data, error } = await admin
    .from("kinetiks_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("account_id", accountId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to fetch connection: ${error.message}`);
  }

  return data as ConnectionRecord;
}

/**
 * Update a connection's status and optionally its metadata.
 */
export async function updateConnectionStatus(
  admin: SupabaseClient,
  connectionId: string,
  status: ConnectionStatus,
  errorMessage?: string
): Promise<void> {
  if (errorMessage) {
    // Fetch existing metadata to merge rather than overwrite
    const { data: existing } = await admin
      .from("kinetiks_connections")
      .select("metadata")
      .eq("id", connectionId)
      .single();

    const existingMeta =
      (existing?.metadata as Record<string, unknown>) ?? {};

    const { error } = await admin
      .from("kinetiks_connections")
      .update({
        status,
        metadata: { ...existingMeta, error: errorMessage },
      })
      .eq("id", connectionId);

    if (error) {
      throw new Error(`Failed to update connection status: ${error.message}`);
    }
  } else {
    const { error } = await admin
      .from("kinetiks_connections")
      .update({ status })
      .eq("id", connectionId);

    if (error) {
      throw new Error(`Failed to update connection status: ${error.message}`);
    }
  }
}

/**
 * Update credentials (e.g. after a token refresh).
 */
export async function updateConnectionCredentials(
  admin: SupabaseClient,
  connectionId: string,
  credentials: StoredCredentials
): Promise<void> {
  const encrypted = encryptCredentials(
    credentials as unknown as Record<string, unknown>
  );

  const { error } = await admin
    .from("kinetiks_connections")
    .update({ credentials: encrypted })
    .eq("id", connectionId);

  if (error) {
    throw new Error(`Failed to update credentials: ${error.message}`);
  }
}

/**
 * Update last_sync_at timestamp after a successful data extraction.
 */
export async function updateLastSync(
  admin: SupabaseClient,
  connectionId: string
): Promise<boolean> {
  const { error } = await admin
    .from("kinetiks_connections")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", connectionId);

  if (error) {
    console.error(`Failed to update last_sync_at: ${error.message}`);
    return false;
  }

  return true;
}

/**
 * Delete a connection and log the event.
 */
export async function deleteConnection(
  admin: SupabaseClient,
  connectionId: string,
  accountId: string,
  provider: ConnectionProvider
): Promise<void> {
  const { error } = await admin
    .from("kinetiks_connections")
    .delete()
    .eq("id", connectionId)
    .eq("account_id", accountId);

  if (error) {
    throw new Error(`Failed to delete connection: ${error.message}`);
  }

  await logConnectionEvent(admin, accountId, "connection_deleted", {
    provider,
    connection_id: connectionId,
  });
}

/**
 * Decrypt credentials from a connection record.
 */
export function getDecryptedCredentials(
  connection: ConnectionRecord
): StoredCredentials {
  if (!connection.credentials) {
    throw new Error("Connection has no stored credentials");
  }
  return decryptCredentials(connection.credentials) as unknown as StoredCredentials;
}

/**
 * Check if an OAuth token is expired (or will expire within 5 minutes).
 * Returns true if the token needs refreshing.
 */
export function isTokenExpired(credentials: StoredOAuthCredentials): boolean {
  if (!credentials.expires_at) return false;
  const bufferSeconds = 300; // 5 minute buffer
  return Date.now() / 1000 >= credentials.expires_at - bufferSeconds;
}

/**
 * Ensure a connection's OAuth token is fresh. Refreshes if expired.
 * Returns the (possibly refreshed) credentials.
 */
export async function ensureFreshToken(
  admin: SupabaseClient,
  connection: ConnectionRecord
): Promise<StoredOAuthCredentials> {
  const creds = getDecryptedCredentials(connection);
  if (creds.type !== "oauth") {
    throw new Error("ensureFreshToken called on non-OAuth connection");
  }

  if (!isTokenExpired(creds)) {
    return creds;
  }

  if (!creds.refresh_token) {
    const authError = new Error(
      "OAuth token expired and no refresh token available. User must re-authorize."
    );
    try {
      await updateConnectionStatus(
        admin,
        connection.id,
        "error",
        authError.message
      );
    } catch (statusErr) {
      console.error(
        "Failed to set connection error status during token expiry:",
        statusErr instanceof Error ? statusErr.message : statusErr
      );
    }
    throw authError;
  }

  const provider = connection.provider as ConnectionProvider;
  const newTokens: OAuthTokens = await refreshAccessToken(
    provider,
    creds.refresh_token
  );

  const updatedCreds: StoredOAuthCredentials = {
    type: "oauth",
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token ?? creds.refresh_token,
    expires_at: newTokens.expires_at,
    token_type: newTokens.token_type,
    scope: newTokens.scope ?? creds.scope,
  };

  await updateConnectionCredentials(
    admin,
    connection.id,
    updatedCreds
  );

  return updatedCreds;
}

/**
 * Log a connection-related event to the Learning Ledger.
 */
async function logConnectionEvent(
  admin: SupabaseClient,
  accountId: string,
  eventType: string,
  detail: Record<string, unknown>
): Promise<void> {
  const { error } = await admin.from("kinetiks_ledger").insert({
    account_id: accountId,
    event_type: eventType,
    source_app: "connections",
    source_operator: "connection_manager",
    detail: {
      ...detail,
      timestamp: new Date().toISOString(),
    },
  });

  if (error) {
    console.error(
      `Failed to log connection event (account=${accountId}, type=${eventType}):`,
      error.message
    );
  }
}
