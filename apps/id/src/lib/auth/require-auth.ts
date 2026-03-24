import { resolveAuth } from "./resolve-auth";
import { checkRateLimit } from "./rate-limit";
import { apiError } from "@/lib/utils/api-response";
import type { AuthenticatedContext, ApiKeyPermission } from "@kinetiks/types";
import { NextResponse } from "next/server";

/** Permission hierarchy: admin > read-write > read-only */
const PERMISSION_LEVEL: Record<ApiKeyPermission, number> = {
  "read-only": 1,
  "read-write": 2,
  admin: 3,
};

interface RequireAuthOptions {
  /** Minimum permission level required. Only checked for API key auth. */
  permissions?: ApiKeyPermission;
  /**
   * App scope(s) this endpoint serves. When provided and the API key has
   * a non-empty scope array, at least one of these must appear in the
   * key's scope. Only checked for API key auth - session and internal
   * auth are not scope-restricted.
   *
   * Accepts a single app name or an array of app names.
   */
  allowedScopes?: string | string[];
  /** Skip rate limiting for this request. */
  skipRateLimit?: boolean;
  /**
   * Allow internal service auth (INTERNAL_SERVICE_SECRET).
   * Defaults to false. Routes that support internal auth must
   * set this to true and handle the `__internal__` account_id
   * by reading the real account_id from the request body.
   */
  allowInternal?: boolean;
}

type AuthResult =
  | { auth: AuthenticatedContext; error: null }
  | { auth: null; error: NextResponse };

/**
 * Authenticate a request and return the resolved context.
 * For API key auth, also checks permission levels, app scopes,
 * and rate limits.
 *
 * Usage:
 * ```
 * const { auth, error } = await requireAuth(request);
 * if (error) return error;
 * // auth is now AuthenticatedContext
 * ```
 */
export async function requireAuth(
  request: Request,
  options?: RequireAuthOptions
): Promise<AuthResult> {
  const auth = await resolveAuth(request);

  if (!auth) {
    return { auth: null, error: apiError("Unauthorized", 401) };
  }

  // Reject internal auth unless the route explicitly allows it
  if (auth.auth_method === "internal" && !options?.allowInternal) {
    return { auth: null, error: apiError("This endpoint does not accept internal service auth", 403) };
  }

  // Check permission level for API key auth
  if (options?.permissions && auth.auth_method === "api_key" && auth.permissions) {
    const required = PERMISSION_LEVEL[options.permissions];
    const actual = PERMISSION_LEVEL[auth.permissions];

    if (actual < required) {
      return {
        auth: null,
        error: apiError(
          `Insufficient permissions. Required: ${options.permissions}, actual: ${auth.permissions}`,
          403
        ),
      };
    }
  }

  // Check app scope for API key auth
  if (
    options?.allowedScopes &&
    auth.auth_method === "api_key" &&
    auth.scope &&
    auth.scope.length > 0
  ) {
    const allowed = Array.isArray(options.allowedScopes)
      ? options.allowedScopes
      : [options.allowedScopes];

    const hasScope = auth.scope.some((s) => allowed.includes(s));

    if (!hasScope) {
      return {
        auth: null,
        error: apiError(
          `API key scope does not include required app: ${allowed.join(", ")}`,
          403
        ),
      };
    }
  }

  // Rate limit check for API key auth
  if (
    auth.auth_method === "api_key" &&
    auth.key_id &&
    auth.rate_limit_per_minute &&
    auth.rate_limit_per_day &&
    !options?.skipRateLimit
  ) {
    const rateResult = await checkRateLimit(
      auth.key_id,
      auth.rate_limit_per_minute,
      auth.rate_limit_per_day
    );

    if (!rateResult.allowed) {
      const response = NextResponse.json(
        {
          success: false,
          error: "Rate limit exceeded",
        },
        { status: 429 }
      );

      response.headers.set("Retry-After", "60");
      response.headers.set(
        "X-RateLimit-Limit-Minute",
        String(auth.rate_limit_per_minute)
      );
      response.headers.set(
        "X-RateLimit-Remaining-Minute",
        String(rateResult.remaining.minute)
      );
      response.headers.set(
        "X-RateLimit-Limit-Day",
        String(auth.rate_limit_per_day)
      );
      response.headers.set(
        "X-RateLimit-Remaining-Day",
        String(rateResult.remaining.day)
      );

      return { auth: null, error: response };
    }
  }

  return { auth, error: null };
}
