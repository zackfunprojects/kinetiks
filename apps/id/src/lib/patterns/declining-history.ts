/**
 * Phase 2 helper for the decay calibration pass.
 *
 * Counts `pattern_arbitrated` Ledger entries with
 * `detail.to = 'declining'` per pattern_id for a given account, within
 * the calibration window. One query per account, not per pattern —
 * the calibration route calls this once at the top of its per-account
 * loop and reads the resulting Map cheaply for each pattern it
 * evaluates.
 *
 * Returns a Map keyed by pattern_id. Patterns with zero declining
 * transitions in the window are NOT keyed in the Map; callers default
 * to 0 with `map.get(pattern_id) ?? 0`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CALIBRATION_WINDOW_DAYS } from "./decay-calibration";

interface DecliningLedgerRow {
  detail: { pattern_id?: unknown; to?: unknown } | null;
}

export interface FetchDecliningCountsInput {
  admin: SupabaseClient;
  account_id: string;
  now: Date;
}

export async function fetchDecliningCountsForAccount(
  input: FetchDecliningCountsInput,
): Promise<Map<string, number>> {
  const { admin, account_id, now } = input;
  const windowStart = new Date(
    now.getTime() - CALIBRATION_WINDOW_DAYS * 86_400_000,
  ).toISOString();

  // PostgREST: filter on the JSONB `detail->>to` field. We can't
  // GROUP BY at the PostgREST layer, so we SELECT then aggregate in
  // JS. The volume is bounded by transitions/day × window/day ×
  // patterns, which for v1 substrate (fixtures + Kinetiks-internal)
  // is in the low thousands per account at most.
  const { data, error } = await admin
    .from("kinetiks_ledger")
    .select("detail")
    .eq("account_id", account_id)
    .eq("event_type", "pattern_arbitrated")
    .eq("detail->>to", "declining")
    .gte("created_at", windowStart);

  if (error) {
    throw new Error(
      `[declining-history] ${account_id}: ${error.message} (${error.code})`,
    );
  }

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as DecliningLedgerRow[]) {
    const patternId = row.detail?.pattern_id;
    if (typeof patternId !== "string") continue;
    counts.set(patternId, (counts.get(patternId) ?? 0) + 1);
  }
  return counts;
}
