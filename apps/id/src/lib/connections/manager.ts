import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ConnectionProvider,
  ConnectionRecord,
  ConnectionPublic,
} from "@kinetiks/types";

/**
 * Phase 7 — connection read helpers.
 *
 * Pre-Phase-7 this module owned the full OAuth lifecycle: encryption,
 * token refresh, OAuth-state mutation. Phase 7 moved all of that to
 * Nango — tokens never touch our database, refresh is Nango's
 * problem. What remains here is the small set of read helpers that
 * the route handlers and Marcus tools use to look up connection
 * rows.
 *
 * Writes go through:
 *   - apps/id/src/lib/integrations/nango/handlers/auth.ts (auth webhook)
 *   - apps/id/src/app/api/connections/[id]/route.ts (disconnect)
 *
 * Both use the admin client directly; no helper here.
 */

const PUBLIC_COLUMNS =
  "id, account_id, provider, status, last_sync_at, metadata, created_at" as const;
const READ_COLUMNS =
  "id, account_id, provider, status, credentials, nango_connection_id, nango_provider_config_key, last_sync_at, metadata, created_at" as const;

/**
 * List all connections for an account, stripping credentials and
 * Nango identifiers from the response. Public projection.
 */
export async function getConnections(
  admin: SupabaseClient,
  accountId: string,
): Promise<ConnectionPublic[]> {
  const { data, error } = await admin
    .from("kinetiks_connections")
    .select(PUBLIC_COLUMNS)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`Failed to list connections: ${error.message}`);
  }
  return (data ?? []) as unknown as ConnectionPublic[];
}

/**
 * Look up a single connection by (account, provider). Returns the
 * full row including Nango identifiers; the caller is responsible
 * for stripping fields before responding to clients.
 */
export async function getConnectionByProvider(
  admin: SupabaseClient,
  accountId: string,
  provider: ConnectionProvider,
): Promise<ConnectionRecord | null> {
  const { data, error } = await admin
    .from("kinetiks_connections")
    .select(READ_COLUMNS)
    .eq("account_id", accountId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to fetch connection: ${error.message}`);
  }
  return (data as unknown as ConnectionRecord | null) ?? null;
}

/**
 * Look up a single connection by row id, scoped to an account.
 */
export async function getConnectionById(
  admin: SupabaseClient,
  connectionId: string,
  accountId: string,
): Promise<ConnectionRecord | null> {
  const { data, error } = await admin
    .from("kinetiks_connections")
    .select(READ_COLUMNS)
    .eq("id", connectionId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to fetch connection: ${error.message}`);
  }
  return (data as unknown as ConnectionRecord | null) ?? null;
}
