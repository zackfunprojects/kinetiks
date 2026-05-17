/**
 * Metric cache helpers — the SWR layer between extractors and tools.
 *
 * Cache key: (account_id, source, normalized_input_hash). The hash is
 * derived from a canonical-JSON serialization of the tool input so that
 * different argument orders, undefined values, and equivalent literals
 * all collapse to the same key.
 *
 * SWR states:
 *   fresh                 - expires_at > now(); return cached
 *   stale_revalidating    - expires_at <= now(); return cached + enqueue refresh
 *   miss                  - no row; caller blocks on extractor
 *
 * Concurrent refreshes are gated by a Postgres advisory lock keyed by the
 * cache row. The cron and the on-demand refresh path both take the same
 * lock, so duplicate work is suppressed without an explicit `in_flight`
 * column. Locks self-release if a worker crashes.
 */

import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface MetricCacheKey {
  account_id: string;
  source: string;
  normalized_input_hash: string;
}

export interface MetricCacheRow {
  id: string;
  account_id: string;
  source: string;
  normalized_input_hash: string;
  input: Record<string, unknown>;
  response: Record<string, unknown>;
  refreshed_at: string;
  stale_after_seconds: number;
  expires_at: string;
  provider_etag: string | null;
  error_state: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type CacheStatus =
  | "fresh"
  | "stale_revalidating"
  | "fresh_from_extractor";

export interface NormalizedInput {
  canonical: Record<string, unknown>;
  hash: string;
}

/**
 * Canonicalize a JSON-shaped value:
 *  - Strips undefined fields
 *  - Sorts object keys recursively (deterministic key order)
 *  - Preserves array order (semantically significant)
 *  - Coerces nothing — numbers stay numbers, strings stay strings
 *
 * Returns the canonicalized value plus a sha256 hex digest of its
 * JSON serialization. Hash collisions are not a security concern here;
 * the cache is per-account scoped under RLS.
 */
export function normalizeInput(input: unknown): NormalizedInput {
  const canonical = canonicalize(input) as Record<string, unknown>;
  const hash = createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
  return { canonical, hash };
}

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const v = obj[key];
      if (v === undefined) continue;
      out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}

/**
 * Read a cache row by key. Returns null on miss.
 */
export async function getCachedMetric(
  admin: SupabaseClient,
  key: MetricCacheKey
): Promise<MetricCacheRow | null> {
  const { data, error } = await admin
    .from("kinetiks_metric_cache")
    .select(
      "id, account_id, source, normalized_input_hash, input, response, refreshed_at, stale_after_seconds, expires_at, provider_etag, error_state, created_at, updated_at"
    )
    .eq("account_id", key.account_id)
    .eq("source", key.source)
    .eq("normalized_input_hash", key.normalized_input_hash)
    .maybeSingle();

  if (error) {
    throw new Error(`metric_cache read failed: ${error.message}`);
  }
  return (data as MetricCacheRow | null) ?? null;
}

export interface WriteCachedMetricInput {
  account_id: string;
  source: string;
  input: Record<string, unknown>;            // already-canonicalized input (or we re-canonicalize)
  response: Record<string, unknown>;
  stale_after_seconds: number;
  provider_etag?: string | null;
  error_state?: Record<string, unknown> | null;
}

/**
 * Upsert a cache row. `refreshed_at` is set to now() and `expires_at`
 * is computed as now() + stale_after_seconds. The cache key is
 * (account_id, source, normalized_input_hash) per the unique index.
 */
export async function writeCachedMetric(
  admin: SupabaseClient,
  input: WriteCachedMetricInput
): Promise<MetricCacheRow> {
  const { canonical, hash } = normalizeInput(input.input);
  const refreshedAt = new Date();
  const expiresAt = new Date(
    refreshedAt.getTime() + input.stale_after_seconds * 1000
  );

  const { data, error } = await admin
    .from("kinetiks_metric_cache")
    .upsert(
      {
        account_id: input.account_id,
        source: input.source,
        normalized_input_hash: hash,
        input: canonical,
        response: input.response,
        refreshed_at: refreshedAt.toISOString(),
        stale_after_seconds: input.stale_after_seconds,
        expires_at: expiresAt.toISOString(),
        provider_etag: input.provider_etag ?? null,
        error_state: input.error_state ?? null,
      },
      { onConflict: "account_id,source,normalized_input_hash" }
    )
    .select(
      "id, account_id, source, normalized_input_hash, input, response, refreshed_at, stale_after_seconds, expires_at, provider_etag, error_state, created_at, updated_at"
    )
    .single();

  if (error || !data) {
    throw new Error(
      `metric_cache write failed: ${error?.message ?? "no row returned"}`
    );
  }
  return data as MetricCacheRow;
}

export function isFresh(row: MetricCacheRow): boolean {
  return new Date(row.expires_at).getTime() > Date.now();
}

export function cacheStatus(row: MetricCacheRow | null): CacheStatus | null {
  if (row === null) return null;
  return isFresh(row) ? "fresh" : "stale_revalidating";
}

/**
 * Acquire a per-cache-row advisory lock for the duration of fn().
 * If another worker holds the lock, the callback is NOT executed and
 * `acquired: false` is returned (the caller is expected to fall back
 * to serving stale data).
 *
 * The advisory lock is session-scoped: it is released by the
 * pg_advisory_unlock call, or when the session ends. We always
 * release explicitly in a finally.
 *
 * Lock key derivation:
 *   hashtextextended('metric_cache_refresh:' || source || ':' || hash, 0)
 * which yields a bigint suitable for pg_try_advisory_lock(bigint).
 */
export async function withRefreshLock<T>(
  admin: SupabaseClient,
  key: MetricCacheKey,
  fn: () => Promise<T>
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  const lockKey = computeLockKey(key);

  const acquired = await tryAdvisoryLock(admin, lockKey);
  if (!acquired) return { acquired: false };

  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    await releaseAdvisoryLock(admin, lockKey);
  }
}

/**
 * Compute the lock identifier as a 64-bit signed integer (Postgres bigint).
 * sha256 the key string and take the first 8 bytes as a signed BE integer.
 */
export function computeLockKey(key: MetricCacheKey): string {
  const digest = createHash("sha256")
    .update(`metric_cache_refresh:${key.source}:${key.normalized_input_hash}`)
    .digest();
  // First 8 bytes -> bigint via DataView; toString to keep precision
  const view = new DataView(
    digest.buffer,
    digest.byteOffset,
    digest.byteLength
  );
  return view.getBigInt64(0, false).toString();
}

async function tryAdvisoryLock(
  admin: SupabaseClient,
  lockKey: string
): Promise<boolean> {
  const { data, error } = await admin.rpc("_kt_try_advisory_lock", {
    p_key: lockKey,
  });

  if (error) {
    throw new Error(
      `advisory_lock acquisition failed: ${error.message} (key=${lockKey})`
    );
  }

  return Boolean(data);
}

async function releaseAdvisoryLock(
  admin: SupabaseClient,
  lockKey: string
): Promise<void> {
  const { error } = await admin.rpc("_kt_release_advisory_lock", {
    p_key: lockKey,
  });

  if (error) {
    // Log but do not throw — the lock will release on session end.
    console.error(
      `advisory_lock release failed (key=${lockKey}): ${error.message}`
    );
  }
}
