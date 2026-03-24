/**
 * GET  /api/connections     - List all connections for the authenticated user
 * POST /api/connections     - Initiate a new connection (OAuth redirect or API key storage)
 */

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import {
  getConnections,
  getConnectionByProvider,
  createConnection,
  buildAuthorizationUrl,
  isValidProvider,
} from "@/lib/connections";
import {
  providerRequiresPkce,
  generatePkceVerifier,
} from "@/lib/connections/oauth";
import type { StoredApiKeyCredentials } from "@/lib/connections";
import { getProvider } from "@/lib/connections/providers";
import type { ConnectionProvider } from "@kinetiks/types";
import { signState } from "@/lib/connections/state-hmac";

export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  try {
    const connections = await getConnections(admin, auth.account_id);
    return apiSuccess({ connections });
  } catch (err) {
    console.error("Failed to fetch connections:", err);
    return apiError("Failed to fetch connections", 500);
  }
}

export async function POST(request: Request) {
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

  const { provider, api_key } = body as {
    provider?: string;
    api_key?: string;
  };

  if (!provider || typeof provider !== "string" || !isValidProvider(provider)) {
    return apiError("Missing or invalid 'provider' field", 400);
  }

  const admin = createAdminClient();

  // Check for existing connection
  const existing = await getConnectionByProvider(
    admin,
    auth.account_id,
    provider as ConnectionProvider
  );
  if (existing && existing.status !== "revoked") {
    return apiError(`Already connected to ${provider}. Disconnect first.`, 409);
  }

  const providerDef = getProvider(provider as ConnectionProvider);

  // API key providers - store directly
  if (providerDef.authType === "api_key") {
    if (!api_key || typeof api_key !== "string" || api_key.trim().length === 0) {
      return apiError("Missing 'api_key' for this provider", 400);
    }

    const credentials: StoredApiKeyCredentials = {
      type: "api_key",
      api_key: api_key.trim(),
    };

    try {
      const connection = await createConnection(
        admin,
        auth.account_id,
        provider as ConnectionProvider,
        credentials
      );

      return apiSuccess({
        connection: {
          id: connection.id,
          provider: connection.provider,
          status: connection.status,
          created_at: connection.created_at,
        },
      });
    } catch (err) {
      console.error("Failed to create API key connection:", err);
      return apiError("Failed to create connection", 500);
    }
  }

  // OAuth providers - build authorization URL and return it
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://id.kinetiks.ai";
  const redirectUri = `${appUrl}/api/connections/callback`;

  try {
    // Generate PKCE verifier if provider requires it (e.g. Twitter/X)
    const needsPkce = providerRequiresPkce(provider as ConnectionProvider);
    const pkceVerifier = needsPkce ? generatePkceVerifier() : undefined;

    // State encodes provider + account ID + optional PKCE verifier for the callback.
    // HMAC-signed to prevent tampering (e.g., swapping account_id).
    const statePayload = JSON.stringify({
      provider,
      account_id: auth.account_id,
      ts: Date.now(),
      ...(pkceVerifier ? { pkce_verifier: pkceVerifier } : {}),
    });
    const signature = signState(statePayload);
    const state = Buffer.from(
      JSON.stringify({
        ...JSON.parse(statePayload),
        signature,
      })
    ).toString("base64url");

    const authUrl = buildAuthorizationUrl(
      provider as ConnectionProvider,
      redirectUri,
      state,
      pkceVerifier
    );

    return apiSuccess({ authorization_url: authUrl });
  } catch (err) {
    console.error("Failed to build authorization URL:", err);
    return apiError(
      err instanceof Error
        ? err.message
        : "Failed to initiate OAuth flow",
      500
    );
  }
}
