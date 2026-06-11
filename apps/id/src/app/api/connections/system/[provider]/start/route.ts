/**
 * GET /api/connections/system/[provider]/start — Phase D1.
 *
 * Begins the direct OAuth dance for a system connection
 * (google_workspace / slack / calendar). Browser-navigated (the
 * Connect button points here), so failure modes redirect back to
 * Cortex → Integrations with a `system_connect` banner param instead
 * of returning JSON.
 *
 * Flow: validate provider → check deployment is configured → check
 * no live connection already exists → set the CSRF state cookie →
 * 302 to the provider's authorize URL. The callback route completes
 * the dance.
 */

import { NextResponse } from "next/server";

import { serverEnv } from "@kinetiks/lib/env";

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureException } from "@/lib/observability/sentry";
import {
  isSystemProvider,
  isSystemProviderConfigured,
} from "@/lib/connections/system-providers";
import {
  buildAuthorizeUrl,
  createOauthState,
  oauthStateCookieName,
  systemOauthRedirectUri,
} from "@/lib/connections/system-oauth";

const INTEGRATIONS_PATH = "/cortex/integrations";
const STATE_COOKIE_MAX_AGE_SECONDS = 600;

function integrationsRedirect(
  requestUrl: string,
  params: Record<string, string>,
): NextResponse {
  const url = new URL(INTEGRATIONS_PATH, new URL(requestUrl).origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

interface RouteParams {
  params: Promise<{ provider: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const { provider: providerParam } = await params;

  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) {
    // Browser navigation with a dead session: bounce through login and
    // land back on the integrations page rather than rendering JSON.
    const login = new URL("/login", new URL(request.url).origin);
    login.searchParams.set("redirect", INTEGRATIONS_PATH);
    return NextResponse.redirect(login);
  }

  if (!isSystemProvider(providerParam)) {
    return integrationsRedirect(request.url, {
      system_connect: "error",
      provider: providerParam.slice(0, 32),
    });
  }
  const provider = providerParam;

  if (!isSystemProviderConfigured(provider, serverEnv())) {
    return integrationsRedirect(request.url, {
      system_connect: "not_configured",
      provider,
    });
  }

  // One live connection per (account, provider). Re-auth of a
  // pending/error row is allowed — the callback updates it in place;
  // an active row requires an explicit disconnect first.
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("kinetiks_connections")
    .select("id, status")
    .eq("account_id", auth.account_id)
    .eq("provider", provider)
    .neq("status", "revoked")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) {
    await captureException(existingError, {
      tags: {
        route: "connections/system/start",
        action: "system_connect",
        stage: "existing_check",
        app: "id",
      },
      user: { id: auth.account_id },
      extra: { provider },
    });
    return integrationsRedirect(request.url, { system_connect: "error", provider });
  }
  if (existing && existing.status === "active") {
    return integrationsRedirect(request.url, {
      system_connect: "already_connected",
      provider,
    });
  }

  const state = createOauthState();
  let authorizeUrl: string;
  try {
    authorizeUrl = buildAuthorizeUrl({
      provider,
      redirectUri: systemOauthRedirectUri(provider, request.url),
      state,
    });
  } catch (err) {
    await captureException(err, {
      tags: {
        route: "connections/system/start",
        action: "system_connect",
        stage: "authorize_url",
        app: "id",
      },
      user: { id: auth.account_id },
      extra: { provider },
    });
    return integrationsRedirect(request.url, { system_connect: "error", provider });
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(oauthStateCookieName(provider), state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/connections/system",
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
