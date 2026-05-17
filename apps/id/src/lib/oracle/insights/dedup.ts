/**
 * Dedup helper — pulls every recent Oracle dedup_key for an account so
 * the writer can skip emissions that already exist within the window.
 *
 * Backed by the partial index idx_kinetiks_insights_dedup
 * (migration 00037). Time window applied app-side because Postgres
 * partial indexes can't reference now().
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_WINDOW_HOURS = 24;

export async function loadRecentDedupKeys(
  admin: SupabaseClient,
  accountId: string,
  windowHours: number = DEFAULT_WINDOW_HOURS
): Promise<Set<string>> {
  const sinceIso = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("kinetiks_insights")
    .select("dedup_key")
    .eq("account_id", accountId)
    .eq("source_operator", "oracle.analyzer")
    .gte("created_at", sinceIso)
    .not("dedup_key", "is", null);

  if (error) {
    // Treat dedup read failure as "no recent keys" so we don't suppress
    // emission. Worst case: a duplicate insight (visible + cleaned up).
    return new Set();
  }
  const out = new Set<string>();
  for (const row of data ?? []) {
    if (typeof row.dedup_key === "string") out.add(row.dedup_key);
  }
  return out;
}
