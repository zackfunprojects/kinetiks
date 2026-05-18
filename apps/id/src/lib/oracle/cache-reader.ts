/**
 * Multi-source cache reader for the Oracle analysis cycle.
 *
 * Loads the per-account cache rows the runner needs to feed each
 * detector. Stays purely on `kinetiks_metric_cache` and
 * `kinetiks_crm_entities`; never hits external APIs (those happen
 * during Nango sync).
 *
 * For each source, the runner gets:
 *   - daily time series (date-dimensioned 90d cache row for trend/anomaly)
 *   - per-dimension snapshot (28d cache rows for drill/top-mover)
 *
 * Cross-source data assembly (channel-keyed spend, organic-page joins)
 * happens in the runner itself; this reader just hydrates the buckets.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface CachedMetricRow {
  source: string;
  input: Record<string, unknown>;
  response: Record<string, unknown>;
  refreshed_at: string;
}

export async function loadAccountCacheRows(
  admin: SupabaseClient,
  accountId: string,
  sources: string[]
): Promise<CachedMetricRow[]> {
  if (sources.length === 0) return [];
  const { data, error } = await admin
    .from("kinetiks_metric_cache")
    .select("source, input, response, refreshed_at")
    .eq("account_id", accountId)
    .in("source", sources)
    .order("refreshed_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as CachedMetricRow[];
}

/** Return the active source keys for an account (from kinetiks_connections). */
export async function listConnectedSources(
  admin: SupabaseClient,
  accountId: string
): Promise<string[]> {
  const { data, error } = await admin
    .from("kinetiks_connections")
    .select("provider, status")
    .eq("account_id", accountId)
    .eq("status", "active");

  if (error) return [];
  return Array.from(new Set((data ?? []).map((r) => r.provider as string)));
}
