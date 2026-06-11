/**
 * GET /api/connections/system/[provider]/callback — Phase D1.
 *
 * Completes the direct OAuth dance started at .../start:
 *
 *   1. verify the CSRF state against the httpOnly cookie
 *      (constant-time);
 *   2. exchange the code for provider credentials;
 *   3. encrypt them (AES-256-GCM via KINETIKS_ENCRYPTION_KEY) and
 *      upsert the kinetiks_connections row — update-in-place when a
 *      pending/error row exists from a prior attempt, insert
 *      otherwise;
 *   4. emit the connection_created Ledger entry (mirrors the Nango
 *      auth-webhook path so both connect flows land in the Ledger
 *      uniformly);
 *   5. bounce back to Cortex → Integrations with a banner param.
 *
 * Tokens never appear in logs, Sentry context, metadata jsonb, or
 * redirect URLs — only inside the encrypted credentials column.
 */

import { NextResponse } from "next/server";

import type { SystemConnectionProvider } from "@kinetiks/types";

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureException } from "@/lib/observability/sentry";
import { encryptCredentials } from "@/lib/connections/encryption";
import { isSystemProvider } from "@/lib/connections/system-providers";
import {
  exchangeCodeForCredentials,
  oauthStateCookieName,
  oauthStateMatches,
  SystemOAuthError,
  systemOauthRedirectUri,
} from "@/lib/connections/system-oauth";

const INTEGRATIONS_PATH = "/cortex/integrations";
/** Postgres unique_violation — the partial unique index on live rows. */
const PG_UNIQUE_VIOLATION = "23505";

interface RouteParams {
  params: Promise<{ provider: string }>;
}

function integrationsRedirect(
  requestUrl: string,
  params: Record<string, string>,
  opts?: { clearStateCookieFor?: SystemConnectionProvider },
): NextResponse {
  const url = new URL(INTEGRATIONS_PATH, new URL(requestUrl).origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(url);
  if (opts?.clearStateCookieFor) {
    response.cookies.set(oauthStateCookieName(opts.clearStateCookieFor), "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/connections/system",
      maxAge: 0,
    });
  }
  return response;
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const { provider: providerParam } = await params;

  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) {
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
  const query = new URL(request.url).searchParams;

  // Customer declined the consent screen (or the provider aborted).
  // Not an error on our side; no Sentry.
  if (query.get("error")) {
    return integrationsRedirect(
      request.url,
      { system_connect: "denied", provider },
      { clearStateCookieFor: provider },
    );
  }

  const expectedState = readCookie(request, oauthStateCookieName(provider));
  if (!oauthStateMatches(expectedState, query.get("state"))) {
    await captureException(new Error("OAuth state mismatch on system connect callback"), {
      tags: {
        route: "connections/system/callback",
        action: "system_connect",
        stage: "state_verify",
        app: "id",
      },
      user: { id: auth.account_id },
      extra: { provider, had_cookie: Boolean(expectedState) },
    });
    return integrationsRedirect(
      request.url,
      { system_connect: "error", provider },
      { clearStateCookieFor: provider },
    );
  }

  const code = query.get("code");
  if (!code) {
    return integrationsRedirect(
      request.url,
      { system_connect: "error", provider },
      { clearStateCookieFor: provider },
    );
  }

  let exchange;
  try {
    exchange = await exchangeCodeForCredentials({
      provider,
      code,
      redirectUri: systemOauthRedirectUri(provider, request.url),
    });
  } catch (err) {
    const oauthCode = err instanceof SystemOAuthError ? err.code : "unknown";
    await captureException(err, {
      tags: {
        route: "connections/system/callback",
        action: "system_connect",
        stage: "code_exchange",
        app: "id",
      },
      user: { id: auth.account_id },
      extra: { provider, oauth_error_code: oauthCode },
    });
    return integrationsRedirect(
      request.url,
      {
        system_connect: oauthCode === "not_configured" ? "not_configured" : "error",
        provider,
      },
      { clearStateCookieFor: provider },
    );
  }

  let encrypted: string;
  try {
    encrypted = encryptCredentials(exchange.credentials);
  } catch (err) {
    await captureException(err, {
      tags: {
        route: "connections/system/callback",
        action: "system_connect",
        stage: "encrypt",
        app: "id",
      },
      user: { id: auth.account_id },
      extra: { provider },
    });
    return integrationsRedirect(
      request.url,
      { system_connect: "error", provider },
      { clearStateCookieFor: provider },
    );
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const rowMetadata: Record<string, unknown> = {
    ...exchange.metadata,
    connected_via: "direct_oauth",
    connected_at: nowIso,
  };

  // Update-in-place when a live (pending/error) row exists from a
  // prior attempt; insert otherwise. The partial unique index on
  // (account_id, provider) WHERE status <> 'revoked' backstops the
  // concurrent-tabs race — the losing insert maps to
  // "already_connected" rather than surfacing as a failure.
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
        route: "connections/system/callback",
        action: "system_connect",
        stage: "existing_check",
        app: "id",
      },
      user: { id: auth.account_id },
      extra: { provider },
    });
    return integrationsRedirect(
      request.url,
      { system_connect: "error", provider },
      { clearStateCookieFor: provider },
    );
  }

  let connectionId: string | null = null;
  if (existing) {
    const { data: updated, error: updateError } = await admin
      .from("kinetiks_connections")
      .update({ status: "active", credentials: encrypted, metadata: rowMetadata })
      .eq("id", existing.id)
      .eq("account_id", auth.account_id)
      .select("id")
      .maybeSingle();
    if (updateError || !updated) {
      await captureException(updateError ?? new Error("zero rows updated"), {
        tags: {
          route: "connections/system/callback",
          action: "system_connect",
          stage: "update_row",
          app: "id",
        },
        user: { id: auth.account_id },
        extra: { provider, connection_id: existing.id },
      });
      return integrationsRedirect(
        request.url,
        { system_connect: "error", provider },
        { clearStateCookieFor: provider },
      );
    }
    connectionId = updated.id;
  } else {
    const { data: inserted, error: insertError } = await admin
      .from("kinetiks_connections")
      .insert({
        account_id: auth.account_id,
        provider,
        status: "active",
        credentials: encrypted,
        metadata: rowMetadata,
      })
      .select("id")
      .maybeSingle();
    if (insertError) {
      if (insertError.code === PG_UNIQUE_VIOLATION) {
        // Concurrent connect won the race; their row is live.
        return integrationsRedirect(
          request.url,
          { system_connect: "already_connected", provider },
          { clearStateCookieFor: provider },
        );
      }
      await captureException(insertError, {
        tags: {
          route: "connections/system/callback",
          action: "system_connect",
          stage: "insert_row",
          app: "id",
        },
        user: { id: auth.account_id },
        extra: { provider, postgrest_code: insertError.code },
      });
      return integrationsRedirect(
        request.url,
        { system_connect: "error", provider },
        { clearStateCookieFor: provider },
      );
    }
    connectionId = inserted?.id ?? null;
  }

  // Ledger entry mirrors the Nango auth-webhook path. Failure is
  // captured but never fails the connect — the connection is live.
  const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
    account_id: auth.account_id,
    event_type: "connection_created",
    source_app: "kinetiks_id",
    source_operator: "api.connections.system.callback",
    detail: {
      connection_id: connectionId,
      provider,
      method: "direct_oauth",
      reauth: Boolean(existing),
    },
  });
  if (ledgerError) {
    await captureException(ledgerError, {
      tags: {
        route: "connections/system/callback",
        action: "system_connect",
        stage: "ledger_emit",
        app: "id",
      },
      user: { id: auth.account_id },
      extra: { provider, connection_id: connectionId },
    });
  }

  return integrationsRedirect(
    request.url,
    { system_connect: "success", provider },
    { clearStateCookieFor: provider },
  );
}
