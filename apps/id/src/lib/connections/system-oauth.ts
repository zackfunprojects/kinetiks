/**
 * Direct OAuth flow for system connections — Phase D1.
 *
 * Pure(ish) helpers behind the start/callback routes at
 * `/api/connections/system/[provider]/...`:
 *
 *   - authorize-URL construction (Google OAuth v2 / Slack OAuth v2)
 *   - CSRF state generation + constant-time verification
 *   - code → credentials exchange, normalized per provider into the
 *     exact encrypted-credentials shape the dispatchers read
 *     (google-workspace-token.ts for Google; the D2 slack-dispatcher
 *     for Slack)
 *
 * Token custody: callers encrypt the returned `credentials` object
 * with `encryptCredentials()` before writing `kinetiks_connections`.
 * Nothing in this module logs or returns tokens outside that object;
 * `SystemOAuthError.code` is a safe categorical string.
 *
 * Replaces the Phase 6 plaintext path (`lib/email/connect.ts` and
 * `lib/email/send.ts`, deleted in this phase), which stored and read
 * raw tokens in `kinetiks_system_identity.email_credentials` — a
 * column migration 00075 drops.
 */

import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@kinetiks/lib/env";
import type { SystemConnectionProvider } from "@kinetiks/types";

import {
  getSystemProvider,
  type SystemProviderDefinition,
} from "@/lib/connections/system-providers";

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access";

const EXCHANGE_TIMEOUT_MS = 10_000;

/**
 * Categorical failure for the OAuth dance. `code` is safe for Sentry
 * extra/messages (never carries tokens or user input); `status`
 * carries the upstream HTTP status where one exists.
 */
export class SystemOAuthError extends Error {
  readonly code:
    | "not_configured"
    | "exchange_http_error"
    | "exchange_rejected"
    | "missing_refresh_token"
    | "malformed_response";
  readonly status: number | null;

  constructor(
    code: SystemOAuthError["code"],
    message: string,
    opts?: { status?: number | null },
  ) {
    super(message);
    this.name = "SystemOAuthError";
    this.code = code;
    this.status = opts?.status ?? null;
  }
}

// ============================================================
// CSRF state
// ============================================================

/** Cookie that carries the state nonce across the OAuth round-trip. */
export function oauthStateCookieName(provider: SystemConnectionProvider): string {
  return `kt_sysconn_state_${provider}`;
}

/** 32 random bytes, hex-encoded. */
export function createOauthState(): string {
  return randomBytes(32).toString("hex");
}

/** Constant-time comparison; false on any shape mismatch. */
export function oauthStateMatches(expected: string | undefined, received: string | null): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ============================================================
// Redirect URI
// ============================================================

/**
 * The exact redirect URI registered with the provider console. Must
 * be byte-identical between the authorize request and the token
 * exchange or providers reject the dance. Prefers the canonical
 * NEXT_PUBLIC_APP_URL; falls back to the request origin for local
 * dev where the env var may be unset.
 */
export function systemOauthRedirectUri(
  provider: SystemConnectionProvider,
  requestUrl: string,
): string {
  const env = serverEnv();
  const base = (env.NEXT_PUBLIC_APP_URL ?? new URL(requestUrl).origin).replace(/\/+$/, "");
  return `${base}/api/connections/system/${provider}/callback`;
}

// ============================================================
// Authorize URL
// ============================================================

function googleClientId(): string {
  const env = serverEnv();
  if (!env.GOOGLE_WORKSPACE_CLIENT_ID) {
    throw new SystemOAuthError(
      "not_configured",
      "GOOGLE_WORKSPACE_CLIENT_ID is not configured",
    );
  }
  return env.GOOGLE_WORKSPACE_CLIENT_ID;
}

function slackClientId(): string {
  const env = serverEnv();
  if (!env.SLACK_CLIENT_ID) {
    throw new SystemOAuthError("not_configured", "SLACK_CLIENT_ID is not configured");
  }
  return env.SLACK_CLIENT_ID;
}

/**
 * Build the provider's authorize URL.
 *
 * Google: `access_type=offline` + `prompt=consent` force a refresh
 * token on every connect — without `prompt=consent` Google omits the
 * refresh token on re-auth and the connection would die at the first
 * access-token expiry. `openid email` is appended so the callback can
 * read the connected address from the id_token for display.
 *
 * Slack: bot scopes only (`scope=`); no user scopes requested.
 */
export function buildAuthorizeUrl(args: {
  provider: SystemConnectionProvider;
  redirectUri: string;
  state: string;
}): string {
  const def: SystemProviderDefinition = getSystemProvider(args.provider);
  switch (def.oauthKind) {
    case "google": {
      const params = new URLSearchParams({
        client_id: googleClientId(),
        redirect_uri: args.redirectUri,
        response_type: "code",
        scope: [...def.scopes, "openid", "email"].join(" "),
        access_type: "offline",
        prompt: "consent",
        state: args.state,
      });
      return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
    }
    case "slack": {
      const params = new URLSearchParams({
        client_id: slackClientId(),
        redirect_uri: args.redirectUri,
        scope: def.scopes.join(","),
        state: args.state,
      });
      return `${SLACK_AUTHORIZE_URL}?${params.toString()}`;
    }
  }
}

// ============================================================
// Code exchange
// ============================================================

/**
 * Normalized exchange result. `credentials` is what gets encrypted
 * into `kinetiks_connections.credentials`; `metadata` is the
 * display-safe subset for the row's metadata jsonb (no tokens);
 * `detail` is the one-line string the connected card shows.
 */
export interface SystemOAuthExchangeResult {
  credentials: Record<string, unknown>;
  metadata: Record<string, string>;
  detail: string;
}

/**
 * Exchange an authorization code for credentials.
 *
 * Google credential shape `{ refresh_token, scopes, email }` is the
 * contract `getGoogleWorkspaceAccessToken` (and its calendar sibling)
 * decrypts — change one, change both.
 *
 * Slack credential shape `{ bot_token, scopes, bot_user_id, team_id,
 * team_name, installer_user_id }` is the contract the D2
 * slack-dispatcher and the D4 proactive-DM path read.
 */
export async function exchangeCodeForCredentials(args: {
  provider: SystemConnectionProvider;
  code: string;
  redirectUri: string;
}): Promise<SystemOAuthExchangeResult> {
  const def = getSystemProvider(args.provider);
  switch (def.oauthKind) {
    case "google":
      return exchangeGoogleCode(def, args.code, args.redirectUri);
    case "slack":
      return exchangeSlackCode(def, args.code, args.redirectUri);
  }
}

async function postForm(url: string, form: URLSearchParams): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXCHANGE_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: controller.signal,
    });
  } catch (err) {
    const isAbort = (err as Error)?.name === "AbortError";
    throw new SystemOAuthError(
      "exchange_http_error",
      isAbort ? "Token exchange timed out" : "Token exchange network failure",
    );
  } finally {
    clearTimeout(timer);
  }
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== "object") {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new SystemOAuthError(
      "malformed_response",
      "Token endpoint returned a non-JSON response",
      { status: response.status },
    );
  }
}

/**
 * Pull the email claim out of a Google id_token WITHOUT signature
 * verification — acceptable here because the token arrived directly
 * from Google's token endpoint over TLS in a confidential-client
 * exchange, not from the browser. Display/logging use only; never an
 * auth decision. Returns null on any parse irregularity.
 */
export function emailFromGoogleIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    if (payload && typeof payload === "object" && "email" in payload) {
      const email = (payload as { email: unknown }).email;
      return typeof email === "string" && email.length > 0 ? email : null;
    }
    return null;
  } catch {
    return null;
  }
}

async function exchangeGoogleCode(
  def: SystemProviderDefinition,
  code: string,
  redirectUri: string,
): Promise<SystemOAuthExchangeResult> {
  const env = serverEnv();
  if (!env.GOOGLE_WORKSPACE_CLIENT_ID || !env.GOOGLE_WORKSPACE_CLIENT_SECRET) {
    throw new SystemOAuthError(
      "not_configured",
      "GOOGLE_WORKSPACE_CLIENT_ID/SECRET are not configured",
    );
  }

  const response = await postForm(
    GOOGLE_TOKEN_URL,
    new URLSearchParams({
      client_id: env.GOOGLE_WORKSPACE_CLIENT_ID,
      client_secret: env.GOOGLE_WORKSPACE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  );
  const json = await parseJson(response);

  if (!response.ok || typeof json.error === "string") {
    throw new SystemOAuthError(
      "exchange_rejected",
      `Google token exchange rejected (${typeof json.error === "string" ? json.error : `http_${response.status}`})`,
      { status: response.status },
    );
  }

  const refreshToken = json.refresh_token;
  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    // Should not happen with access_type=offline + prompt=consent;
    // failing loudly beats storing a connection that dies in an hour.
    throw new SystemOAuthError(
      "missing_refresh_token",
      "Google returned no refresh_token; the connection would not survive token expiry",
      { status: response.status },
    );
  }

  const grantedScopes =
    typeof json.scope === "string" && json.scope.length > 0
      ? json.scope.split(" ")
      : [...def.scopes];
  const email = emailFromGoogleIdToken(json.id_token);

  return {
    credentials: {
      refresh_token: refreshToken,
      scopes: grantedScopes,
      email: email ?? undefined,
    },
    metadata: {
      ...(email ? { connected_email: email } : {}),
    },
    detail: email ?? "Google account linked",
  };
}

async function exchangeSlackCode(
  def: SystemProviderDefinition,
  code: string,
  redirectUri: string,
): Promise<SystemOAuthExchangeResult> {
  const env = serverEnv();
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    throw new SystemOAuthError(
      "not_configured",
      "SLACK_CLIENT_ID/SECRET are not configured",
    );
  }

  const response = await postForm(
    SLACK_TOKEN_URL,
    new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  );
  const json = await parseJson(response);

  // Slack returns 200 with { ok: false, error } on failure.
  if (!response.ok || json.ok !== true) {
    throw new SystemOAuthError(
      "exchange_rejected",
      `Slack token exchange rejected (${typeof json.error === "string" ? json.error : `http_${response.status}`})`,
      { status: response.status },
    );
  }

  const botToken = json.access_token;
  if (typeof botToken !== "string" || botToken.length === 0) {
    throw new SystemOAuthError(
      "malformed_response",
      "Slack response carried no bot access_token",
      { status: response.status },
    );
  }

  const team =
    json.team && typeof json.team === "object"
      ? (json.team as { id?: unknown; name?: unknown })
      : {};
  const teamId = typeof team.id === "string" ? team.id : null;
  const teamName = typeof team.name === "string" ? team.name : null;
  const botUserId = typeof json.bot_user_id === "string" ? json.bot_user_id : null;
  // The INSTALLING user's Slack id. In v1 single-user accounts the
  // installer IS the customer, which makes this the DM target for
  // proactive delivery (briefs, alerts, approval cards) - Slack
  // accepts a user id as the channel for DMs. Multi-user teams will
  // store per-member mappings instead.
  const authedUser =
    json.authed_user && typeof json.authed_user === "object"
      ? (json.authed_user as { id?: unknown })
      : {};
  const installerUserId = typeof authedUser.id === "string" ? authedUser.id : null;
  const grantedScopes =
    typeof json.scope === "string" && json.scope.length > 0
      ? json.scope.split(",")
      : [...def.scopes];

  return {
    credentials: {
      bot_token: botToken,
      scopes: grantedScopes,
      bot_user_id: botUserId ?? undefined,
      team_id: teamId ?? undefined,
      team_name: teamName ?? undefined,
      installer_user_id: installerUserId ?? undefined,
    },
    metadata: {
      ...(teamId ? { team_id: teamId } : {}),
      ...(teamName ? { team_name: teamName } : {}),
      ...(botUserId ? { bot_user_id: botUserId } : {}),
      ...(installerUserId ? { installer_user_id: installerUserId } : {}),
    },
    detail: teamName ? `Workspace: ${teamName}` : "Workspace linked",
  };
}

// ============================================================
// Token revocation (best-effort, on disconnect)
// ============================================================

/**
 * Revoke the provider-side grant on disconnect. Best-effort: callers
 * flip the local row to `revoked` and null the credentials regardless
 * of this outcome (mirrors the Nango DELETE path).
 *
 * Google revokes the refresh token (which cascades to its access
 * tokens); Slack revokes the bot token via auth.revoke.
 */
export async function revokeSystemCredentials(args: {
  provider: SystemConnectionProvider;
  credentials: Record<string, unknown>;
}): Promise<"revoked" | "failed" | "skipped"> {
  const def = getSystemProvider(args.provider);
  try {
    switch (def.oauthKind) {
      case "google": {
        const refreshToken = args.credentials.refresh_token;
        if (typeof refreshToken !== "string" || refreshToken.length === 0) return "skipped";
        const response = await postForm(
          "https://oauth2.googleapis.com/revoke",
          new URLSearchParams({ token: refreshToken }),
        );
        return response.ok ? "revoked" : "failed";
      }
      case "slack": {
        const botToken = args.credentials.bot_token;
        if (typeof botToken !== "string" || botToken.length === 0) return "skipped";
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), EXCHANGE_TIMEOUT_MS);
        try {
          const response = await fetch("https://slack.com/api/auth.revoke", {
            method: "POST",
            headers: { Authorization: `Bearer ${botToken}` },
            signal: controller.signal,
          });
          if (!response.ok) return "failed";
          const json: unknown = await response.json().catch(() => null);
          return json && typeof json === "object" && (json as { ok?: unknown }).ok === true
            ? "revoked"
            : "failed";
        } finally {
          clearTimeout(timer);
        }
      }
    }
  } catch {
    return "failed";
  }
}
