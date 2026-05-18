/**
 * kinetiks_sync_logs writer.
 *
 * Every Nango webhook arrival logs exactly one row here, regardless of
 * whether the handler succeeded, partially succeeded, or errored. The
 * Analytics SourcesPanel reads from this table; the rate of failed rows
 * per source informs the "needs reconnect" banner.
 *
 * Writes are service-role only (RLS default-deny on client INSERT).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface WriteSyncLogInput {
  accountId: string;
  source: string;
  syncName: string;
  nangoConnectionId?: string | null;
  status: "succeeded" | "partial" | "failed" | "skipped";
  recordsAdded?: number;
  recordsUpdated?: number;
  recordsDeleted?: number;
  durationMs?: number;
  errorClass?: string | null;
  errorMessage?: string | null;
  webhookId?: string | null;
  payloadSha256?: string | null;
  arrivedAt?: Date;
  providerCompletedAt?: Date | null;
}

export async function writeSyncLog(
  admin: SupabaseClient,
  input: WriteSyncLogInput
): Promise<{ id: string } | null> {
  const row = {
    account_id: input.accountId,
    source: input.source,
    sync_name: input.syncName,
    nango_connection_id: input.nangoConnectionId ?? null,
    status: input.status,
    records_added: input.recordsAdded ?? 0,
    records_updated: input.recordsUpdated ?? 0,
    records_deleted: input.recordsDeleted ?? 0,
    duration_ms: input.durationMs ?? null,
    error_class: input.errorClass ?? null,
    error_message: input.errorMessage ?? null,
    webhook_id: input.webhookId ?? null,
    payload_sha256: input.payloadSha256 ?? null,
    arrived_at: (input.arrivedAt ?? new Date()).toISOString(),
    provider_completed_at: input.providerCompletedAt
      ? input.providerCompletedAt.toISOString()
      : null,
  };

  const { data, error } = await admin
    .from("kinetiks_sync_logs")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    // We never want a sync_log write failure to break the webhook ack —
    // the cost of a missed log is operational, not data integrity. Caller
    // should still surface the error to Sentry via the canonical shape.
    return null;
  }
  return { id: data!.id };
}

/**
 * Replay-detection helper: returns true if a webhook with the same
 * payload_sha256 was logged for this account in the last 5 minutes.
 *
 * Nango retries on timeout; idempotent handlers tolerate replay, but we
 * still write a sync_log row marked skipped so the operator surface
 * shows the duplicate.
 */
export async function isRecentReplay(
  admin: SupabaseClient,
  accountId: string,
  payloadHash: string
): Promise<boolean> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("kinetiks_sync_logs")
    .select("id")
    .eq("account_id", accountId)
    .eq("payload_sha256", payloadHash)
    .gte("arrived_at", fiveMinAgo)
    .limit(1);

  if (error) return false;
  return (data?.length ?? 0) > 0;
}
