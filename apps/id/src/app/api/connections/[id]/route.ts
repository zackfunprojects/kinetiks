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

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import {
  deleteConnection as nangoDeleteConnection,
  triggerSync,
} from "@/lib/integrations/nango/client";
import { getNangoProviderConfig } from "@/lib/integrations/nango/provider-config";
import { isSystemProvider } from "@/lib/connections/system-providers";
import { revokeSystemCredentials } from "@/lib/connections/system-oauth";
import { decryptCredentials } from "@/lib/connections/encryption";
import type {
  ConnectionPublic,
  ConnectionProvider,
  AnyConnectionProvider,
} from "@kinetiks/types";

const GENERIC_LOAD_CONNECTION_ERROR =
  "We couldn't load that connection. Try again in a moment.";
const GENERIC_REVOKE_ERROR = "Failed to revoke connection";
const GENERIC_SYNC_ERROR = "Sync trigger failed";

const SyncRequestSchema = z.object({
  action: z.literal("sync"),
});

// Phase 7 CR: surface the manual-sync throttle from a side channel that
// updates BEFORE the sync completes. `last_sync_at` is the wrong axis
// because it stays stale (or null) while a sync is in flight, letting
// rapid PATCH calls enqueue duplicate runs.
// `metadata.last_manual_sync_request_at` is set inside the same UPDATE
// that triggers the sync, so concurrent callers see it immediately.
const MANUAL_SYNC_THROTTLE_MS = 5 * 60 * 1000;

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ConnectionRow {
  id: string;
  account_id: string;
  provider: string;
  status: string;
  credentials: string | null;
  nango_connection_id: string | null;
  nango_provider_config_key: string | null;
  last_sync_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

type FetchConnectionResult =
  | { kind: "ok"; row: ConnectionRow | null }
  | { kind: "error"; message: string };

// Phase 7 CR: distinguish "no row matched" from "DB query failed."
// Both used to return null, which the callers mapped to 404 — masking
// real failures as not-found and breaking incident triage.
async function fetchConnectionByIdAndAccount(args: {
  admin: ReturnType<typeof createAdminClient>;
  id: string;
  account_id: string;
  route: string;
}): Promise<FetchConnectionResult> {
  const { data, error } = await args.admin
    .from("kinetiks_connections")
    .select(
      "id, account_id, provider, status, credentials, nango_connection_id, nango_provider_config_key, last_sync_at, metadata, created_at",
    )
    .eq("id", args.id)
    .eq("account_id", args.account_id)
    .maybeSingle();
  if (error) {
    Sentry.captureException(error, {
      tags: { route: args.route, action: "fetch_connection", stage: "select", app: "id" },
      user: { id: args.account_id },
      extra: { connection_id: args.id, postgrest_code: error.code },
    });
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", row: (data as ConnectionRow | null) ?? null };
}

export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const { id: connectionId } = await params;
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const result = await fetchConnectionByIdAndAccount({
    admin,
    id: connectionId,
    account_id: auth.account_id,
    route: "connections/[id].GET",
  });
  if (result.kind === "error") return apiError(GENERIC_LOAD_CONNECTION_ERROR, 500);
  if (!result.row) return apiError("Connection not found", 404);
  const connection = result.row;

  const publicConnection: ConnectionPublic = {
    id: connection.id,
    account_id: connection.account_id,
    provider: connection.provider as AnyConnectionProvider,
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
  const result = await fetchConnectionByIdAndAccount({
    admin,
    id: connectionId,
    account_id: auth.account_id,
    route: "connections/[id].DELETE",
  });
  if (result.kind === "error") return apiError(GENERIC_LOAD_CONNECTION_ERROR, 500);
  if (!result.row) return apiError("Connection not found", 404);
  const connection = result.row;
  if (connection.status === "revoked") {
    return apiSuccess({ deleted: true, already_revoked: true });
  }

  // Best-effort provider-side revoke. We always flip our local row
  // regardless of the upstream outcome: if the provider call fails
  // (transient network issue, already-deleted on their side), the
  // customer's connection is still revoked on our side.
  //
  //  - Nango data connections: nango.deleteConnection(); a
  //    `connection.deleted` webhook may arrive later as confirmation
  //    and the auth handler treats it as idempotent.
  //  - System connections (D1): revoke the OAuth grant at the
  //    provider (Google token revoke / Slack auth.revoke) using the
  //    decrypted credentials, then NULL the credentials column so
  //    encrypted tokens do not outlive the connection.
  let nangoOutcome: "deleted" | "skipped" | "failed" = "skipped";
  let systemRevokeOutcome: "revoked" | "skipped" | "failed" = "skipped";
  const isSystemConnection = isSystemProvider(connection.provider);
  if (connection.nango_connection_id && connection.nango_provider_config_key) {
    try {
      await nangoDeleteConnection({
        connection_id: connection.nango_connection_id,
        provider_config_key: connection.nango_provider_config_key,
      });
      nangoOutcome = "deleted";
    } catch (err) {
      Sentry.captureException(err, {
        tags: {
          route: "connections/[id].DELETE",
          action: "nango_delete",
          stage: "nango_revoke",
          app: "id",
        },
        user: { id: auth.account_id },
        extra: {
          connection_id: connection.id,
          provider: connection.provider,
          nango_connection_id: connection.nango_connection_id,
        },
      });
      nangoOutcome = "failed";
      // Fall through and revoke locally anyway.
    }
  } else if (connection.credentials && isSystemProvider(connection.provider)) {
    try {
      systemRevokeOutcome = await revokeSystemCredentials({
        provider: connection.provider,
        credentials: decryptCredentials(connection.credentials),
      });
    } catch (err) {
      // Decrypt failure (rotated key, corrupt blob): the upstream
      // grant survives but the local row still flips and the
      // credentials are nulled below.
      Sentry.captureException(err, {
        tags: {
          route: "connections/[id].DELETE",
          action: "system_revoke",
          stage: "provider_revoke",
          app: "id",
        },
        user: { id: auth.account_id },
        extra: { connection_id: connection.id, provider: connection.provider },
      });
      systemRevokeOutcome = "failed";
    }
  }

  const nowIso = new Date().toISOString();
  const { error: updateError } = await admin
    .from("kinetiks_connections")
    .update({
      status: "revoked",
      ...(isSystemConnection ? { credentials: null } : {}),
      metadata: {
        ...(connection.metadata ?? {}),
        revoked_at: nowIso,
        revocation_reason: "customer_revoked",
        ...(isSystemConnection
          ? { system_revoke_outcome: systemRevokeOutcome }
          : { nango_delete_outcome: nangoOutcome }),
      },
    })
    .eq("id", connectionId)
    .eq("account_id", auth.account_id);
  if (updateError) {
    Sentry.captureException(updateError, {
      tags: {
        route: "connections/[id].DELETE",
        action: "local_revoke",
        stage: "update",
        app: "id",
      },
      user: { id: auth.account_id },
      extra: { connection_id: connection.id, provider: connection.provider },
    });
    return apiError(GENERIC_REVOKE_ERROR, 500);
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
      ...(isSystemConnection
        ? { method: "direct_oauth", system_revoke_outcome: systemRevokeOutcome }
        : {}),
    },
  });
  if (ledgerError) {
    Sentry.captureException(ledgerError, {
      tags: {
        route: "connections/[id].DELETE",
        action: "ledger_emit",
        stage: "post_revoke",
        app: "id",
      },
      user: { id: auth.account_id },
      extra: { connection_id: connection.id, provider: connection.provider },
    });
    // Local row already revoked. Don't fail the request.
  }

  return apiSuccess({
    deleted: true,
    ...(isSystemConnection
      ? { system_revoke_outcome: systemRevokeOutcome }
      : { nango_outcome: nangoOutcome }),
  });
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  const { id: connectionId } = await params;
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let bodyRaw: unknown;
  try {
    bodyRaw = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const parsedBody = SyncRequestSchema.safeParse(bodyRaw);
  if (!parsedBody.success) {
    return apiError(
      `Invalid request: ${parsedBody.error.issues.map((i) => i.message).join("; ")}`,
      400,
    );
  }

  const admin = createAdminClient();
  const result = await fetchConnectionByIdAndAccount({
    admin,
    id: connectionId,
    account_id: auth.account_id,
    route: "connections/[id].PATCH",
  });
  if (result.kind === "error") return apiError(GENERIC_LOAD_CONNECTION_ERROR, 500);
  if (!result.row) return apiError("Connection not found", 404);
  const connection = result.row;

  if (connection.status !== "active" && connection.status !== "error") {
    return apiError(`Cannot sync a ${connection.status} connection`, 400);
  }
  if (!connection.nango_connection_id || !connection.nango_provider_config_key) {
    return apiError(
      "Connection is missing Nango identifiers; reconnect required",
      409,
    );
  }

  // Phase 7 CR round 2: atomic conditional UPDATE so concurrent PATCH
  // calls can't both pass the in-memory check and both trigger Nango.
  // The previous fix moved the throttle to `last_manual_sync_request_at`
  // (set pre-Nango-trigger) but the check + stamp were two separate
  // operations: two requests reading the old value would both pass the
  // check, both stamp, both call triggerSync.
  //
  // Now: the UPDATE itself filters on
  //   metadata->>'last_manual_sync_request_at' IS NULL
  //   OR metadata->>'last_manual_sync_request_at' < cutoff_iso
  // and we check whether the row actually updated. Postgres serializes
  // the writes so exactly one caller wins; the loser sees 0 affected
  // rows and returns 429.
  const existingMeta = (connection.metadata ?? {}) as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const cutoffIso = new Date(Date.now() - MANUAL_SYNC_THROTTLE_MS).toISOString();
  const { data: stamped, error: throttleError } = await admin
    .from("kinetiks_connections")
    .update({
      metadata: {
        ...existingMeta,
        last_manual_sync_request_at: nowIso,
      },
    })
    .eq("id", connection.id)
    .eq("account_id", auth.account_id)
    .or(
      `metadata->>last_manual_sync_request_at.is.null,metadata->>last_manual_sync_request_at.lt.${cutoffIso}`,
    )
    .select("id")
    .maybeSingle();
  if (throttleError) {
    Sentry.captureException(throttleError, {
      tags: {
        route: "connections/[id].PATCH",
        action: "throttle_stamp",
        stage: "pre_trigger",
        app: "id",
      },
      user: { id: auth.account_id },
      extra: { connection_id: connection.id, provider: connection.provider },
    });
    return apiError(GENERIC_SYNC_ERROR, 500);
  }
  if (!stamped) {
    // Lost the race: another concurrent PATCH already stamped the
    // throttle marker. Reject as rate-limited; don't trigger Nango.
    return apiError(
      "A manual sync was requested less than 5 minutes ago. Please wait.",
      429,
    );
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
    Sentry.captureException(err, {
      tags: {
        route: "connections/[id].PATCH",
        action: "trigger_sync",
        stage: "nango_trigger",
        app: "id",
      },
      user: { id: auth.account_id },
      extra: {
        connection_id: connection.id,
        provider: connection.provider,
        nango_connection_id: connection.nango_connection_id,
      },
    });
    return apiError(GENERIC_SYNC_ERROR, 500);
  }
}
