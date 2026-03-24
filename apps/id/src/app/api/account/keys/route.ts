import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { generateApiKey } from "@/lib/auth/api-keys";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import type { ApiKeyPermission, ApiKeyPublic } from "@kinetiks/types";

const VALID_PERMISSIONS: ApiKeyPermission[] = [
  "read-only",
  "read-write",
  "admin",
];

/**
 * GET /api/account/keys
 * List all API keys for the authenticated account.
 * Returns public info only (prefix, name, permissions) - never the hash or full key.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const { data: keys, error: fetchError } = await admin
    .from("kinetiks_api_keys")
    .select(
      "id, key_prefix, name, permissions, scope, rate_limit_per_minute, rate_limit_per_day, expires_at, is_active, last_used_at, created_at"
    )
    .eq("account_id", auth.account_id)
    .order("created_at", { ascending: false });

  if (fetchError) {
    console.error("Failed to fetch API keys:", fetchError.message);
    return apiError("Failed to fetch API keys", 500);
  }

  return apiSuccess(keys as ApiKeyPublic[]);
}

/**
 * POST /api/account/keys
 * Create a new Kinetiks API key.
 * The full key is returned ONCE in the response.
 * Body: { name, permissions?, scope?, rate_limit_per_minute?, rate_limit_per_day?, expires_at? }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  // Only admin keys or session auth can create keys
  if (auth.auth_method === "api_key" && auth.permissions !== "admin") {
    return apiError("Only admin API keys can create new keys", 403);
  }

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

  const {
    name,
    permissions = "read-write",
    scope = [],
    rate_limit_per_minute = 60,
    rate_limit_per_day = 10000,
    expires_at,
  } = body as {
    name?: string;
    permissions?: string;
    scope?: string[];
    rate_limit_per_minute?: number;
    rate_limit_per_day?: number;
    expires_at?: string;
  };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return apiError("Missing or empty 'name' field", 400);
  }

  if (!VALID_PERMISSIONS.includes(permissions as ApiKeyPermission)) {
    return apiError(
      `Invalid permissions. Must be one of: ${VALID_PERMISSIONS.join(", ")}`,
      400
    );
  }

  if (!Array.isArray(scope)) {
    return apiError("scope must be an array of app names", 400);
  }

  if (
    typeof rate_limit_per_minute !== "number" ||
    rate_limit_per_minute < 1 ||
    rate_limit_per_minute > 10000
  ) {
    return apiError("rate_limit_per_minute must be between 1 and 10000", 400);
  }

  if (
    typeof rate_limit_per_day !== "number" ||
    rate_limit_per_day < 1 ||
    rate_limit_per_day > 1000000
  ) {
    return apiError("rate_limit_per_day must be between 1 and 1000000", 400);
  }

  if (expires_at) {
    const expiresDate = new Date(expires_at);
    if (isNaN(expiresDate.getTime()) || expiresDate <= new Date()) {
      return apiError("expires_at must be a valid future ISO timestamp", 400);
    }
  }

  const { key, hash, prefix } = generateApiKey();
  const admin = createAdminClient();

  const { data: inserted, error: insertError } = await admin
    .from("kinetiks_api_keys")
    .insert({
      account_id: auth.account_id,
      key_hash: hash,
      key_prefix: prefix,
      name: name.trim(),
      permissions,
      scope,
      rate_limit_per_minute,
      rate_limit_per_day,
      expires_at: expires_at ?? null,
    })
    .select(
      "id, key_prefix, name, permissions, scope, rate_limit_per_minute, rate_limit_per_day, expires_at, is_active, created_at"
    )
    .single();

  if (insertError) {
    console.error("Failed to create API key:", insertError.message);
    return apiError("Failed to create API key", 500);
  }

  // Return the full key ONCE - it cannot be retrieved again
  return apiSuccess({
    ...inserted,
    key,
  });
}

/**
 * PATCH /api/account/keys
 * Update an existing API key.
 * Body: { key_id, name?, permissions?, scope?, rate_limit_per_minute?, rate_limit_per_day?, expires_at? }
 */
export async function PATCH(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  if (auth.auth_method === "api_key" && auth.permissions !== "admin") {
    return apiError("Only admin API keys can update keys", 403);
  }

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

  const { key_id } = body as { key_id?: string };
  if (!key_id || typeof key_id !== "string") {
    return apiError("Missing key_id", 400);
  }

  const admin = createAdminClient();

  // Verify the key belongs to this account
  const { data: existing } = await admin
    .from("kinetiks_api_keys")
    .select("id")
    .eq("id", key_id)
    .eq("account_id", auth.account_id)
    .single();

  if (!existing) {
    return apiError("API key not found", 404);
  }

  // Build update object with only provided fields
  const updates: Record<string, unknown> = {};

  if ("name" in body && typeof body.name === "string") {
    updates.name = (body.name as string).trim();
  }
  if (
    "permissions" in body &&
    VALID_PERMISSIONS.includes(body.permissions as ApiKeyPermission)
  ) {
    updates.permissions = body.permissions;
  }
  if ("scope" in body && Array.isArray(body.scope)) {
    updates.scope = body.scope;
  }
  if (
    "rate_limit_per_minute" in body &&
    typeof body.rate_limit_per_minute === "number"
  ) {
    updates.rate_limit_per_minute = body.rate_limit_per_minute;
  }
  if (
    "rate_limit_per_day" in body &&
    typeof body.rate_limit_per_day === "number"
  ) {
    updates.rate_limit_per_day = body.rate_limit_per_day;
  }
  if ("expires_at" in body) {
    updates.expires_at = body.expires_at ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return apiError("No valid fields to update", 400);
  }

  const { data: updated, error: updateError } = await admin
    .from("kinetiks_api_keys")
    .update(updates)
    .eq("id", key_id)
    .select(
      "id, key_prefix, name, permissions, scope, rate_limit_per_minute, rate_limit_per_day, expires_at, is_active, last_used_at, created_at"
    )
    .single();

  if (updateError) {
    console.error("Failed to update API key:", updateError.message);
    return apiError("Failed to update API key", 500);
  }

  return apiSuccess(updated as ApiKeyPublic);
}

/**
 * DELETE /api/account/keys
 * Revoke an API key (sets is_active = false). Cannot be undone.
 * Body: { key_id: string }
 */
export async function DELETE(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  if (auth.auth_method === "api_key" && auth.permissions !== "admin") {
    return apiError("Only admin API keys can revoke keys", 403);
  }

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

  const { key_id } = body as { key_id?: string };
  if (!key_id || typeof key_id !== "string") {
    return apiError("Missing key_id", 400);
  }

  const admin = createAdminClient();

  const { error: updateError } = await admin
    .from("kinetiks_api_keys")
    .update({ is_active: false })
    .eq("id", key_id)
    .eq("account_id", auth.account_id);

  if (updateError) {
    console.error("Failed to revoke API key:", updateError.message);
    return apiError("Failed to revoke API key", 500);
  }

  return apiSuccess({ revoked: true, key_id });
}
