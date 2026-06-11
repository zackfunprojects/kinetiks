/**
 * Google access-token helper — Phase 4 Chunk 6, generalized in D1.
 *
 * Fetches the per-account Google connection row from
 * `kinetiks_connections`, decrypts the credentials, and exchanges the
 * stored refresh_token for a short-lived access_token via Google's
 * OAuth2 token endpoint. Returns the access_token + token type so the
 * Gmail and Calendar dispatchers can authorize their REST calls.
 *
 * Two Google-backed system providers share this helper:
 *   - `google_workspace` (Gmail send/read/modify) → draft_email tool,
 *     D2 outbound email, D4 inbound polling
 *   - `calendar` (Calendar events) → add_calendar_event tool, D4
 *     meeting prep
 * They are SEPARATE connections with separate refresh tokens so the
 * customer can revoke either independently (comms spec §4.3).
 *
 * Connection row convention (written by the D1 callback route):
 *   provider = "google_workspace" | "calendar"
 *   status = "active"
 *   credentials = encryptCredentials({
 *     refresh_token: string,
 *     scopes: string[],
 *     email: string              // the connected address (for logs)
 *   })
 *
 * Per CLAUDE.md: OAuth tokens never leave server boundaries
 * unencrypted; they live in `kinetiks_connections.credentials` and
 * are decrypted only here and inside Edge Functions. Never logged.
 *
 * Token-refresh failure modes are mapped to ToolError shape so the
 * runtime can react: configuration_error for env misconfig,
 * unavailable for missing connection rows, transient for network/5xx,
 * permanent for OAuth error responses (invalid_grant means the
 * customer revoked Google access).
 */

import "server-only";

import { z } from "zod";

import {
  classifyHttpStatus,
  fetchWithTimeout,
  parseJsonOrToolError,
  ToolError,
} from "@kinetiks/tools";
import { serverEnv } from "@kinetiks/lib/env";

import { decryptCredentials } from "@/lib/connections/encryption";
import { createAdminClient } from "@/lib/supabase/admin";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

type GoogleSystemProvider = "google_workspace" | "calendar";

const PROVIDER_LABEL: Record<GoogleSystemProvider, string> = {
  google_workspace: "Google Workspace",
  calendar: "Google Calendar",
};

export interface GoogleWorkspaceAccessToken {
  /** Short-lived access token. Expires per `expires_in` (typically 3600s). */
  access_token: string;
  /** "Bearer" — exactly one type returned by Google v2 OAuth. */
  token_type: string;
  /** Seconds until the access token expires. */
  expires_in: number;
  /** Email of the connected account; safe to log. */
  connected_email: string;
}

/**
 * Runtime validation of the decrypted blob (CR: a malformed payload
 * must fail here as "reconnect", not later as an opaque OAuth error).
 * Loose on extras so credential-shape additions stay non-breaking.
 */
const GoogleConnectionCredentialsSchema = z
  .object({
    refresh_token: z.string().min(1),
    scopes: z.array(z.string()).optional(),
    email: z.string().optional(),
  })
  .passthrough();

type GoogleConnectionCredentials = z.infer<typeof GoogleConnectionCredentialsSchema>;

/** Gmail-scoped token from the `google_workspace` connection. */
export async function getGoogleWorkspaceAccessToken(args: {
  account_id: string;
}): Promise<GoogleWorkspaceAccessToken> {
  return getGoogleAccessTokenForProvider({ ...args, provider: "google_workspace" });
}

/** Calendar-scoped token from the `calendar` connection. */
export async function getGoogleCalendarAccessToken(args: {
  account_id: string;
}): Promise<GoogleWorkspaceAccessToken> {
  return getGoogleAccessTokenForProvider({ ...args, provider: "calendar" });
}

async function getGoogleAccessTokenForProvider(args: {
  account_id: string;
  provider: GoogleSystemProvider;
}): Promise<GoogleWorkspaceAccessToken> {
  const label = PROVIDER_LABEL[args.provider];
  const env = serverEnv();
  if (!env.GOOGLE_WORKSPACE_CLIENT_ID || !env.GOOGLE_WORKSPACE_CLIENT_SECRET) {
    throw new ToolError(
      "configuration_error",
      `GOOGLE_WORKSPACE_CLIENT_ID/SECRET are not configured; ${label} tools cannot run`,
      { context: { account_id: args.account_id, provider: args.provider } },
    );
  }

  // Latest non-revoked row. The partial unique index on
  // (account_id, provider) WHERE status <> 'revoked' guarantees at
  // most one; order+limit keeps this read safe even against
  // pre-index history (a bare maybeSingle() errors on multiple rows).
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kinetiks_connections")
    .select("credentials, status")
    .eq("account_id", args.account_id)
    .eq("provider", args.provider)
    .neq("status", "revoked")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ToolError(
      "transient",
      `Failed to read kinetiks_connections for ${args.provider}: ${error.message}`,
      { context: { account_id: args.account_id, provider: args.provider } },
    );
  }
  if (!data) {
    throw new ToolError(
      "unavailable",
      `${label} is not connected for this account. Ask the customer to connect ${label} in Cortex → Integrations.`,
      { context: { account_id: args.account_id, provider: args.provider } },
    );
  }
  if (data.status !== "active") {
    throw new ToolError(
      "unavailable",
      `${label} connection status is "${data.status}" (expected "active"). Ask the customer to reconnect.`,
      {
        context: {
          account_id: args.account_id,
          provider: args.provider,
          status: String(data.status ?? "unknown"),
        },
      },
    );
  }

  const credsRaw = data.credentials as string | null;
  if (typeof credsRaw !== "string" || credsRaw.length === 0) {
    throw new ToolError(
      "unavailable",
      `${label} connection has no encrypted credentials. Ask the customer to reconnect.`,
      { context: { account_id: args.account_id, provider: args.provider } },
    );
  }

  let decrypted: unknown;
  try {
    decrypted = decryptCredentials(credsRaw);
  } catch (err) {
    throw new ToolError(
      "permanent",
      `Failed to decrypt ${label} credentials: ${(err as Error)?.message ?? "unknown"}`,
      { context: { account_id: args.account_id, provider: args.provider } },
    );
  }
  const parsedCreds = GoogleConnectionCredentialsSchema.safeParse(decrypted);
  if (!parsedCreds.success) {
    throw new ToolError(
      "unavailable",
      `${label} credentials are malformed (missing refresh_token). Ask the customer to reconnect.`,
      { context: { account_id: args.account_id, provider: args.provider } },
    );
  }
  const creds: GoogleConnectionCredentials = parsedCreds.data;

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
    context: { account_id: args.account_id, provider: args.provider },
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
    context: { account_id: args.account_id, provider: args.provider },
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
      `Google OAuth refresh failed (${code}). ${"error_description" in json && json.error_description ? json.error_description : `Ask the customer to reconnect ${label}.`}`,
      {
        context: {
          account_id: args.account_id,
          provider: args.provider,
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
