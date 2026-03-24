/**
 * Generic OAuth2 helpers for data connection providers.
 *
 * Handles authorization URL generation, code-for-token exchange,
 * and token refresh. Provider-specific endpoints are configured here.
 */

import { randomBytes, createHash } from "crypto";
import type { ConnectionProvider, OAuthTokens } from "@kinetiks/types";
import type { OAuthEndpoints } from "./types";

/** Timeout for token exchange and refresh HTTP requests (15 seconds). */
const TOKEN_FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// PKCE helpers (RFC 7636)
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographic PKCE code verifier (43-128 chars, URL-safe).
 */
export function generatePkceVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Derive the S256 code challenge from a verifier.
 */
export function generatePkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Fetch with an AbortController-based timeout.
 * Throws on timeout with a clear message.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = TOKEN_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Token request to ${url} timed out after ${timeoutMs}ms`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get OAuth endpoint configuration for a provider.
 * Throws if the provider doesn't support OAuth or env vars are missing.
 */
function getOAuthEndpoints(provider: ConnectionProvider): OAuthEndpoints {
  switch (provider) {
    case "ga4":
    case "gsc": {
      // GA4 and GSC share Google OAuth
      const clientId =
        provider === "ga4"
          ? process.env.GA4_CLIENT_ID
          : process.env.GSC_CLIENT_ID;
      const clientSecret =
        provider === "ga4"
          ? process.env.GA4_CLIENT_SECRET
          : process.env.GSC_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error(
          `Missing OAuth credentials for ${provider}. Set ${provider === "ga4" ? "GA4" : "GSC"}_CLIENT_ID and _CLIENT_SECRET.`
        );
      }

      const scopes =
        provider === "ga4"
          ? ["https://www.googleapis.com/auth/analytics.readonly"]
          : ["https://www.googleapis.com/auth/webmasters.readonly"];

      return {
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes,
        clientId,
        clientSecret,
      };
    }

    case "hubspot": {
      const clientId = process.env.HUBSPOT_CLIENT_ID;
      const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error(
          "Missing HUBSPOT_CLIENT_ID or HUBSPOT_CLIENT_SECRET."
        );
      }
      return {
        authorizationUrl: "https://app.hubspot.com/oauth/authorize",
        tokenUrl: "https://api.hubapi.com/oauth/v1/token",
        scopes: ["crm.objects.contacts.read", "crm.objects.deals.read"],
        clientId,
        clientSecret,
      };
    }

    case "salesforce": {
      const clientId = process.env.SALESFORCE_CLIENT_ID;
      const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error(
          "Missing SALESFORCE_CLIENT_ID or SALESFORCE_CLIENT_SECRET."
        );
      }
      return {
        authorizationUrl: "https://login.salesforce.com/services/oauth2/authorize",
        tokenUrl: "https://login.salesforce.com/services/oauth2/token",
        scopes: ["api", "refresh_token"],
        clientId,
        clientSecret,
      };
    }

    case "twitter": {
      const clientId = process.env.TWITTER_CLIENT_ID;
      const clientSecret = process.env.TWITTER_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error(
          "Missing TWITTER_CLIENT_ID or TWITTER_CLIENT_SECRET."
        );
      }
      return {
        authorizationUrl: "https://twitter.com/i/oauth2/authorize",
        tokenUrl: "https://api.twitter.com/2/oauth2/token",
        scopes: [
          "tweet.read",
          "users.read",
          "follows.read",
          "offline.access",
        ],
        clientId,
        clientSecret,
        requiresPkce: true,
        useBasicAuth: true,
      };
    }

    case "linkedin": {
      const clientId = process.env.LINKEDIN_CLIENT_ID;
      const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error(
          "Missing LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET."
        );
      }
      return {
        authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
        tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
        scopes: ["r_organization_social", "rw_organization_admin"],
        clientId,
        clientSecret,
      };
    }

    case "instagram": {
      const clientId = process.env.INSTAGRAM_CLIENT_ID;
      const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error(
          "Missing INSTAGRAM_CLIENT_ID or INSTAGRAM_CLIENT_SECRET."
        );
      }
      return {
        authorizationUrl: "https://www.facebook.com/v19.0/dialog/oauth",
        tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
        scopes: [
          "instagram_basic",
          "instagram_manage_insights",
          "pages_show_list",
        ],
        clientId,
        clientSecret,
      };
    }

    case "stripe":
    case "resend":
      throw new Error(
        `${provider} uses API key auth, not OAuth. Use direct credential storage.`
      );

    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}

/**
 * Result of building an authorization URL.
 * Includes an optional PKCE verifier that must be persisted for the callback.
 */
export interface AuthorizationUrlResult {
  url: string;
  /** Non-null when the provider requires PKCE. Must be stored and passed to exchangeCodeForTokens. */
  pkceVerifier: string | null;
}

/**
 * Check whether a provider requires PKCE.
 */
export function providerRequiresPkce(provider: ConnectionProvider): boolean {
  try {
    const endpoints = getOAuthEndpoints(provider);
    return endpoints.requiresPkce === true;
  } catch {
    return false;
  }
}

/**
 * Build the authorization URL to redirect the user to the OAuth provider.
 *
 * @param provider - The connection provider
 * @param redirectUri - The callback URL (e.g. https://id.kinetiks.ai/api/connections/callback)
 * @param state - Opaque state string (provider + account info, base64-encoded)
 * @param pkceVerifier - Pre-generated PKCE verifier (required for PKCE providers)
 */
export function buildAuthorizationUrl(
  provider: ConnectionProvider,
  redirectUri: string,
  state: string,
  pkceVerifier?: string
): string {
  const endpoints = getOAuthEndpoints(provider);
  const params = new URLSearchParams({
    client_id: endpoints.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: endpoints.scopes.join(" "),
    state,
  });

  // Google-specific params to get a refresh token
  const isGoogle = provider === "ga4" || provider === "gsc";
  if (isGoogle) {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  }

  // PKCE (RFC 7636) for providers that require it (e.g. Twitter/X)
  if (endpoints.requiresPkce) {
    if (!pkceVerifier) {
      throw new Error(
        `Provider ${provider} requires PKCE but no verifier was provided. Generate one with generatePkceVerifier().`
      );
    }
    const challenge = generatePkceChallenge(pkceVerifier);
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
  }

  return `${endpoints.authorizationUrl}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 *
 * @param pkceVerifier - Required when the provider uses PKCE (stored from buildAuthorizationUrl).
 */
export async function exchangeCodeForTokens(
  provider: ConnectionProvider,
  code: string,
  redirectUri: string,
  pkceVerifier?: string | null
): Promise<OAuthTokens> {
  const endpoints = getOAuthEndpoints(provider);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  // PKCE verifier
  if (pkceVerifier) {
    body.set("code_verifier", pkceVerifier);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (endpoints.useBasicAuth) {
    // Basic auth: base64(client_id:client_secret)
    const basic = Buffer.from(
      `${endpoints.clientId}:${endpoints.clientSecret}`
    ).toString("base64");
    headers["Authorization"] = `Basic ${basic}`;
  } else {
    // Standard body credentials
    body.set("client_id", endpoints.clientId);
    body.set("client_secret", endpoints.clientSecret);
  }

  const response = await fetchWithTimeout(endpoints.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Token exchange failed for ${provider}: ${response.status} - ${errorText}`
    );
  }

  const data = (await response.json()) as Record<string, unknown>;

  if (
    !data.access_token ||
    typeof data.access_token !== "string" ||
    data.access_token.length === 0
  ) {
    throw new Error(
      `Token exchange for ${provider} returned no access_token`
    );
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : null;

  return {
    access_token: data.access_token,
    refresh_token:
      typeof data.refresh_token === "string" ? data.refresh_token : null,
    expires_at: expiresIn
      ? Math.floor(Date.now() / 1000) + expiresIn
      : null,
    token_type:
      typeof data.token_type === "string" ? data.token_type : "Bearer",
    scope: typeof data.scope === "string" ? data.scope : null,
  };
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshAccessToken(
  provider: ConnectionProvider,
  refreshToken: string
): Promise<OAuthTokens> {
  const endpoints = getOAuthEndpoints(provider);

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (endpoints.useBasicAuth) {
    const basic = Buffer.from(
      `${endpoints.clientId}:${endpoints.clientSecret}`
    ).toString("base64");
    headers["Authorization"] = `Basic ${basic}`;
  } else {
    body.set("client_id", endpoints.clientId);
    body.set("client_secret", endpoints.clientSecret);
  }

  const response = await fetchWithTimeout(endpoints.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Token refresh failed for ${provider}: ${response.status} - ${errorText}`
    );
  }

  const data = (await response.json()) as Record<string, unknown>;

  if (
    !data.access_token ||
    typeof data.access_token !== "string" ||
    data.access_token.length === 0
  ) {
    throw new Error(
      `Token refresh for ${provider} returned no access_token`
    );
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : null;

  return {
    access_token: data.access_token,
    refresh_token:
      typeof data.refresh_token === "string"
        ? data.refresh_token
        : refreshToken,
    expires_at: expiresIn
      ? Math.floor(Date.now() / 1000) + expiresIn
      : null,
    token_type:
      typeof data.token_type === "string" ? data.token_type : "Bearer",
    scope: typeof data.scope === "string" ? data.scope : null,
  };
}
