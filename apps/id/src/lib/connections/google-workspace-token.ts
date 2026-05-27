/**
 * Google Workspace access-token helper per Phase 4 — Chunk 6.
 *
 * Fetches the per-account Google Workspace connection row from
 * `kinetiks_connections`, decrypts the credentials, and exchanges the
 * stored refresh_token for a short-lived access_token via Google's
 * OAuth2 token endpoint. Returns the access_token + token type so the
 * Gmail and Calendar dispatchers can authorize their REST calls.
 *
 * Connection row convention:
 *   provider = "google_workspace"
 *   status = "active"
 *   credentials = encryptCredentials({
 *     refresh_token: string,
 *     scopes: string[],          // e.g. ["https://www.googleapis.com/auth/gmail.compose", "calendar.events"]
 *     email: string              // the connected Gmail address (for logs)
 *   })
 *
 * Per CLAUDE.md: OAuth tokens never leave server boundaries unencrypted;
 * they live in `kinetiks_connections.credentials` and are decrypted
 * only here and inside Edge Functions. Never logged.
 *
 * Token-refresh failure modes are mapped to ToolError shape so the
 * runtime can react: configuration_error for env misconfig, unavailable
 * for missing connection rows, transient for network/5xx, permanent
 * for OAuth error responses (invalid_grant means the customer revoked
 * Google access).
 */

import "server-only";

import { ToolError } from "@kinetiks/tools";
import { serverEnv } from "@kinetiks/lib/env";

import { decryptCredentials } from "@/lib/connections/encryption";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyHttpStatus,
  fetchWithTimeout,
  parseJsonOrToolError,
} from "@/lib/dispatchers/fetch-with-timeout";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleWorkspaceAccessToken {
  /** Short-lived access token. Expires per `expires_in` (typically 3600s). */
  access_token: string;
  /** "Bearer" — exactly one type returned by Google v2 OAuth. */
  token_type: string;
  /** Seconds until the access token expires. */
  expires_in: number;
  /** Email of the connected Workspace account; safe to log. */
  connected_email: string;
}

interface GoogleWorkspaceCredentials {
  refresh_token: string;
  scopes?: string[];
  email?: string;
}

export async function getGoogleWorkspaceAccessToken(args: {
  account_id: string;
}): Promise<GoogleWorkspaceAccessToken> {
  const env = serverEnv();
  if (!env.GOOGLE_WORKSPACE_CLIENT_ID || !env.GOOGLE_WORKSPACE_CLIENT_SECRET) {
    throw new ToolError(
      "configuration_error",
      "GOOGLE_WORKSPACE_CLIENT_ID/SECRET are not configured; Google Workspace tools cannot run",
      { context: { account_id: args.account_id } },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kinetiks_connections")
    .select("credentials, status")
    .eq("account_id", args.account_id)
    .eq("provider", "google_workspace")
    .maybeSingle();

  if (error) {
    throw new ToolError(
      "transient",
      `Failed to read kinetiks_connections for google_workspace: ${error.message}`,
      { context: { account_id: args.account_id } },
    );
  }
  if (!data) {
    throw new ToolError(
      "unavailable",
      "Google Workspace is not connected for this account. Ask the customer to connect Google Workspace in Settings → Connections.",
      { context: { account_id: args.account_id, provider: "google_workspace" } },
    );
  }
  if (data.status !== "active") {
    throw new ToolError(
      "unavailable",
      `Google Workspace connection status is "${data.status}" (expected "active"). Ask the customer to reconnect.`,
      {
        context: {
          account_id: args.account_id,
          provider: "google_workspace",
          status: String(data.status ?? "unknown"),
        },
      },
    );
  }

  const credsRaw = data.credentials as string | null;
  if (typeof credsRaw !== "string" || credsRaw.length === 0) {
    throw new ToolError(
      "unavailable",
      "Google Workspace connection has no encrypted credentials. Ask the customer to reconnect.",
      { context: { account_id: args.account_id } },
    );
  }

  let creds: GoogleWorkspaceCredentials;
  try {
    creds = decryptCredentials(credsRaw) as unknown as GoogleWorkspaceCredentials;
  } catch (err) {
    throw new ToolError(
      "permanent",
      `Failed to decrypt Google Workspace credentials: ${(err as Error)?.message ?? "unknown"}`,
      { context: { account_id: args.account_id } },
    );
  }
  if (!creds.refresh_token) {
    throw new ToolError(
      "unavailable",
      "Google Workspace credentials missing refresh_token. Reconnect.",
      { context: { account_id: args.account_id } },
    );
  }

  // Exchange refresh_token for access_token via Google OAuth v2.
  const body = new URLSearchParams({
    client_id: env.GOOGLE_WORKSPACE_CLIENT_ID,
    client_secret: env.GOOGLE_WORKSPACE_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: creds.refresh_token,
  });
  const response = await fetchWithTimeout({
    url: GOOGLE_TOKEN_URL,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    tool: "google_workspace_token_refresh",
    context: { account_id: args.account_id },
  });

  const json = await parseJsonOrToolError<
    | {
        access_token: string;
        token_type: string;
        expires_in: number;
      }
    | { error: string; error_description?: string }
  >(response, {
    tool: "google_workspace_token_refresh",
    context: { account_id: args.account_id },
  });

  if (!response.ok || "error" in json) {
    const code = "error" in json ? json.error : `http_${response.status}`;
    // Classification:
    //   - invalid_grant → unavailable (customer revoked Google access; reconnect needed)
    //   - HTTP 5xx / 429 → transient (Google had a hiccup; retry)
    //   - everything else → permanent (misconfig, scope issue, etc.)
    let errorClass: "unavailable" | "transient" | "permanent";
    if (code === "invalid_grant") {
      errorClass = "unavailable";
    } else if (classifyHttpStatus(response.status) === "transient") {
      errorClass = "transient";
    } else {
      errorClass = "permanent";
    }
    throw new ToolError(
      errorClass,
      `Google OAuth refresh failed (${code}). ${"error_description" in json && json.error_description ? json.error_description : "Ask the customer to reconnect Google Workspace."}`,
      {
        context: {
          account_id: args.account_id,
          oauth_error: code,
          http_status: response.status,
        },
      },
    );
  }
  return {
    access_token: json.access_token,
    token_type: json.token_type,
    expires_in: json.expires_in,
    connected_email: creds.email ?? "unknown",
  };
}
