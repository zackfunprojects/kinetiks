/**
 * GET /api/connections/callback
 *
 * OAuth callback handler. Receives the authorization code from the OAuth provider,
 * exchanges it for tokens, encrypts and stores them, then redirects to /connections.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  createConnection,
  getConnectionByProvider,
  reactivateConnection,
  isValidProvider,
} from "@/lib/connections";
import type { StoredOAuthCredentials } from "@/lib/connections";
import type { ConnectionProvider } from "@kinetiks/types";
import { verifyStateSignature } from "@/lib/connections/state-hmac";

interface OAuthState {
  provider: string;
  account_id: string;
  ts: number;
  pkce_verifier?: string;
  signature?: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://id.kinetiks.ai";
  const connectionsUrl = `${appUrl}/connections`;

  // User denied the OAuth consent
  if (error) {
    const redirectUrl = new URL(connectionsUrl);
    redirectUrl.searchParams.set("error", "oauth_denied");
    redirectUrl.searchParams.set("detail", error);
    return NextResponse.redirect(redirectUrl.toString());
  }

  if (!code || !stateParam) {
    const redirectUrl = new URL(connectionsUrl);
    redirectUrl.searchParams.set("error", "missing_params");
    return NextResponse.redirect(redirectUrl.toString());
  }

  // Verify the user is authenticated before processing the callback
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    const redirectUrl = new URL(connectionsUrl);
    redirectUrl.searchParams.set("error", "not_authenticated");
    return NextResponse.redirect(redirectUrl.toString());
  }

  // Decode state
  let state: OAuthState;
  try {
    const decoded = Buffer.from(stateParam, "base64url").toString("utf8");
    state = JSON.parse(decoded) as OAuthState;
  } catch {
    const redirectUrl = new URL(connectionsUrl);
    redirectUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(redirectUrl.toString());
  }

  // Verify HMAC signature before any other checks (prevents state tampering)
  if (!state.signature) {
    const redirectUrl = new URL(connectionsUrl);
    redirectUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(redirectUrl.toString());
  }

  const { signature, ...stateWithoutSig } = state;
  const dataToVerify = JSON.stringify(stateWithoutSig);
  if (!verifyStateSignature(dataToVerify, signature)) {
    const redirectUrl = new URL(connectionsUrl);
    redirectUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(redirectUrl.toString());
  }

  // Validate state freshness (10 minute max)
  const stateAge = Date.now() - state.ts;
  if (stateAge > 10 * 60 * 1000) {
    const redirectUrl = new URL(connectionsUrl);
    redirectUrl.searchParams.set("error", "state_expired");
    return NextResponse.redirect(redirectUrl.toString());
  }

  if (!isValidProvider(state.provider)) {
    const redirectUrl = new URL(connectionsUrl);
    redirectUrl.searchParams.set("error", "invalid_provider");
    return NextResponse.redirect(redirectUrl.toString());
  }

  const provider = state.provider as ConnectionProvider;
  const redirectUri = `${appUrl}/api/connections/callback`;

  const admin = createAdminClient();

  // Verify the state's account_id belongs to the authenticated user
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account || account.id !== state.account_id) {
    const redirectUrl = new URL(connectionsUrl);
    redirectUrl.searchParams.set("error", "account_mismatch");
    return NextResponse.redirect(redirectUrl.toString());
  }

  const accountId = account.id;

  try {
    // Exchange code for tokens (pass PKCE verifier if present in state)
    const tokens = await exchangeCodeForTokens(
      provider,
      code,
      redirectUri,
      state.pkce_verifier
    );

    const credentials: StoredOAuthCredentials = {
      type: "oauth",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      token_type: tokens.token_type,
      scope: tokens.scope,
    };

    // Check if connection already exists (e.g. previously revoked)
    const existing = await getConnectionByProvider(admin, accountId, provider);

    if (existing) {
      // Reactivate existing connection with new credentials in a single atomic update
      await reactivateConnection(admin, existing.id, credentials);
    } else {
      // Create new connection
      await createConnection(admin, accountId, provider, credentials);
    }

    const redirectUrl = new URL(connectionsUrl);
    redirectUrl.searchParams.set("success", provider);
    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    console.error(`OAuth callback error for ${provider}:`, err);
    const redirectUrl = new URL(connectionsUrl);
    redirectUrl.searchParams.set("error", "token_exchange_failed");
    redirectUrl.searchParams.set("provider", provider);
    return NextResponse.redirect(redirectUrl.toString());
  }
}
