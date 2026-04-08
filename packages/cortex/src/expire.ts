import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Default expiration window for proposals without an explicit expires_at.
 * Submitted proposals that haven't been evaluated after this period are expired.
 */
const DEFAULT_STALE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * How many proposals to process per sweep to avoid timeout.
 */
const BATCH_SIZE = 100;

export interface ExpireResult {
  expired_count: number;
  superseded_count: number;
}

/**
 * Expiration sweeper - runs periodically to clean up stale proposals.
 *
 * Two types of expiration:
 * 1. Explicit expiration: proposals with expires_at in the past
 * 2. Stale expiration: submitted proposals sitting unprocessed too long
 *
 * Also marks accepted proposals as superseded if a newer proposal
 * for the same layer has been accepted since.
 */
export async function runExpirationSweep(
  admin: SupabaseClient
): Promise<ExpireResult> {
  const now = new Date().toISOString();

  // ── Expire proposals with explicit expires_at ──
  const { data: expiredExplicit } = await admin
    .from("kinetiks_proposals")
    .update({
      status: "expired",
      evaluated_at: now,
      evaluated_by: "cortex_expiration",
    })
    .in("status", ["submitted", "accepted"])
    .lt("expires_at", now)
    .not("expires_at", "is", null)
    .select("id, account_id, target_layer, source_app")
    .limit(BATCH_SIZE);

  // ── Expire stale unprocessed proposals ──
  const staleThreshold = new Date(
    Date.now() - DEFAULT_STALE_WINDOW_MS
  ).toISOString();

  const { data: expiredStale } = await admin
    .from("kinetiks_proposals")
    .update({
      status: "expired",
      decline_reason: "stale_unprocessed",
      evaluated_at: now,
      evaluated_by: "cortex_expiration",
    })
    .eq("status", "submitted")
    .lt("submitted_at", staleThreshold)
    .select("id, account_id, target_layer, source_app")
    .limit(BATCH_SIZE);

  const allExpired = [
    ...(expiredExplicit ?? []),
    ...(expiredStale ?? []),
  ];

  // Log expirations to ledger
  if (allExpired.length > 0) {
    const ledgerEntries = allExpired.map((p) => ({
      account_id: p.account_id,
      event_type: "expiration",
      source_app: p.source_app,
      target_layer: p.target_layer,
      detail: { proposal_id: p.id },
    }));

    await admin.from("kinetiks_ledger").insert(ledgerEntries);
  }

  // ── Mark superseded proposals ──
  // Find accepted proposals where a newer accepted proposal exists for the same account+layer
  // Mark superseded proposals manually
  const supersededCount = await markSupersededManually(admin);

  return {
    expired_count: allExpired.length,
    superseded_count: supersededCount,
  };
}

/**
 * Fallback: manually find and mark superseded proposals.
 * A proposal is superseded if a newer accepted proposal exists
 * for the same account + layer.
 */
async function markSupersededManually(admin: SupabaseClient): Promise<number> {
  // Get accepted proposals grouped by account+layer, ordered by evaluated_at desc
  const { data: accepted } = await admin
    .from("kinetiks_proposals")
    .select("id, account_id, target_layer, evaluated_at")
    .eq("status", "accepted")
    .order("evaluated_at", { ascending: false })
    .limit(500);

  if (!accepted || accepted.length === 0) return 0;

  // Group by account+layer, find older ones to supersede
  const groups = new Map<string, string[]>();
  for (const p of accepted) {
    const key = `${p.account_id}:${p.target_layer}`;
    const existing = groups.get(key) ?? [];
    existing.push(p.id);
    groups.set(key, existing);
  }

  const toSupersede: string[] = [];
  for (const ids of groups.values()) {
    // Keep the newest (first), supersede the rest
    if (ids.length > 1) {
      toSupersede.push(...ids.slice(1));
    }
  }

  if (toSupersede.length === 0) return 0;

  // Batch update - take only up to BATCH_SIZE
  const batch = toSupersede.slice(0, BATCH_SIZE);
  await admin
    .from("kinetiks_proposals")
    .update({
      status: "superseded",
      evaluated_at: new Date().toISOString(),
      evaluated_by: "cortex_expiration",
    })
    .in("id", batch);

  return batch.length;
}
