/**
 * withFreshToken — wrap an extractor call so it gets a fresh OAuth token,
 * retries once on 401, and marks the connection 'error' on a second failure.
 *
 * Builds on the existing ensureFreshToken (manager.ts) which only handles
 * known-expired tokens within a 5-min buffer. This helper additionally
 * handles:
 *
 *   - Clock-skew 401s: the provider says expired even though `expires_at`
 *     puts us in the future. Force-refresh and retry once.
 *   - Revoked grants: a refresh that itself yields 401 must mark the
 *     connection as needing re-auth.
 *
 * Callers signal "the provider rejected this token" by throwing a
 * TokenRejectedError from the inner callback. Any other thrown error is
 * propagated unchanged.
 *
 * Reused for GA4 in D1; the same shape extends to GSC + Stripe in D3.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConnectionRecord,
  ConnectionProvider,
  OAuthTokens,
} from "@kinetiks/types";
import {
  ensureFreshToken,
  getDecryptedCredentials,
  updateConnectionCredentials,
  updateConnectionStatus,
} from "./manager";
import { refreshAccessToken } from "./oauth";
import type { StoredOAuthCredentials } from "./types";

/**
 * Throw this from inside `withFreshToken`'s callback when the provider
 * responds with a 401 (or equivalent). The helper will force-refresh the
 * token and retry the callback once.
 */
export class TokenRejectedError extends Error {
  readonly provider: ConnectionProvider;
  readonly httpStatus: number | null;
  readonly providerErrorCode: string | null;

  constructor(
    provider: ConnectionProvider,
    options: { httpStatus?: number | null; providerErrorCode?: string | null; cause?: unknown } = {}
  ) {
    super(
      `OAuth token rejected by ${provider} (http=${options.httpStatus ?? "n/a"})`
    );
    this.name = "TokenRejectedError";
    this.provider = provider;
    this.httpStatus = options.httpStatus ?? null;
    this.providerErrorCode = options.providerErrorCode ?? null;
    if (options.cause !== undefined) {
      // ES2022 cause; tsc skips if target is older — guarded
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * Run `fn(creds)` with a fresh OAuth token for the given connection.
 *
 * Flow:
 *  1. ensureFreshToken — refresh if expires_at is within the 5-min buffer.
 *  2. Call fn(creds).
 *  3. If fn throws TokenRejectedError, force a refresh (even if
 *     expires_at was in the future) and retry fn once.
 *  4. If the second attempt also throws TokenRejectedError (or the
 *     refresh itself fails), mark the connection 'error' and re-throw
 *     a TokenRejectedError so the caller can fail the run cleanly.
 *  5. All other errors propagate unchanged.
 *
 * Important: never silently swallow errors. The Approval/Cortex pipeline
 * relies on connection-status truth.
 */
export async function withFreshToken<T>(
  admin: SupabaseClient,
  connection: ConnectionRecord,
  fn: (creds: StoredOAuthCredentials) => Promise<T>
): Promise<T> {
  const initial = getDecryptedCredentials(connection);
  if (initial.type !== "oauth") {
    throw new Error(
      `withFreshToken called on non-OAuth connection (provider=${connection.provider})`
    );
  }

  const fresh = await ensureFreshToken(admin, connection);

  try {
    return await fn(fresh);
  } catch (err) {
    if (!(err instanceof TokenRejectedError)) throw err;

    // Force a refresh even though ensureFreshToken thought we were fine.
    const refreshed = await forceRefresh(admin, connection, fresh).catch(
      (refreshErr) => {
        // Mark the connection 'error' and surface a clean rejection.
        void markConnectionError(
          admin,
          connection.id,
          refreshErr instanceof Error
            ? `Token refresh failed: ${refreshErr.message}`
            : "Token refresh failed"
        );
        throw new TokenRejectedError(connection.provider as ConnectionProvider, {
          cause: refreshErr,
        });
      }
    );

    try {
      return await fn(refreshed);
    } catch (retryErr) {
      if (retryErr instanceof TokenRejectedError) {
        await markConnectionError(
          admin,
          connection.id,
          "Provider rejected refreshed token; reauthorization required"
        );
      }
      throw retryErr;
    }
  }
}

/**
 * Refresh the access token unconditionally, using the existing refresh
 * token. Persists the new tokens back to kinetiks_connections.
 *
 * Throws if no refresh token is available — that's an unrecoverable state.
 */
async function forceRefresh(
  admin: SupabaseClient,
  connection: ConnectionRecord,
  current: StoredOAuthCredentials
): Promise<StoredOAuthCredentials> {
  if (!current.refresh_token) {
    throw new Error(
      `Cannot refresh ${connection.provider}: no refresh token stored. User must re-authorize.`
    );
  }

  const provider = connection.provider as ConnectionProvider;
  const newTokens: OAuthTokens = await refreshAccessToken(
    provider,
    current.refresh_token
  );

  const updated: StoredOAuthCredentials = {
    type: "oauth",
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token ?? current.refresh_token,
    expires_at: newTokens.expires_at,
    token_type: newTokens.token_type,
    scope: newTokens.scope ?? current.scope,
  };

  await updateConnectionCredentials(admin, connection.id, updated);
  return updated;
}

async function markConnectionError(
  admin: SupabaseClient,
  connectionId: string,
  message: string
): Promise<void> {
  try {
    await updateConnectionStatus(admin, connectionId, "error", message);
  } catch (err) {
    // Status-update failure must not mask the original token rejection.
    console.error(
      `withFreshToken: failed to mark connection ${connectionId} as 'error': ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}
