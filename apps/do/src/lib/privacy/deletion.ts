/**
 * Account deletion cascade for DeskOf.
 *
 * Triggered by the Kinetiks ID account-deletion webhook. Final Supplement
 * §2.3 specifies a three-stage cascade with strict timing:
 *
 *   Within 1 hour:    Reddit OAuth tokens revoked + deleted from
 *                     deskof_platform_accounts. Active sessions
 *                     terminated. User removed from opportunity queues.
 *
 *   Within 24 hours:  All deskof_ rows for this user permanently deleted.
 *                     Cached deskof_threads remain (shared resource) but
 *                     no user-specific links survive.
 *
 *   Within 7 days:    Operator Profile purged from Cortex. Backups
 *                     marked for purge in next rotation.
 *
 *   Immediately:      Analytics events younger than 90 days are
 *                     anonymized (user_id_hash → null).
 *
 * Phase 1 ships the orchestrator skeleton + the row creation. The
 * scheduled background processor that actually executes the cascade
 * lands in Phase 8 alongside the privacy/export pipeline.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DeletionStatus =
  | "pending"
  | "in_progress"
  | "complete"
  | "failed";

export interface DeletionRequest {
  id: string;
  user_id: string;
  status: DeletionStatus;
  requested_at: string;
  tokens_revoked_at: string | null;
  data_deleted_at: string | null;
  cortex_purged_at: string | null;
  error_message: string | null;
}

/** Postgres unique-violation SQLSTATE — caught from concurrent inserts. */
const PG_UNIQUE_VIOLATION = "23505";

async function readPendingRequest(
  admin: SupabaseClient,
  userId: string
): Promise<DeletionRequest | null> {
  const { data, error } = await admin
    .from("deskof_data_deletion_requests")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["pending", "in_progress"])
    .maybeSingle();
  if (error) {
    throw new Error(
      `requestAccountDeletion read failed: ${error.message}`
    );
  }
  return (data as DeletionRequest | null) ?? null;
}

/**
 * Insert a fresh deletion request row. Atomically idempotent under
 * concurrent webhook retries.
 *
 * Concurrency model:
 *   1. Read for an existing pending/in_progress row
 *   2. If none, insert a new one
 *   3. If the insert hits the partial unique index
 *      `deskof_data_deletion_requests_user_pending_unique` (23505),
 *      another concurrent request landed first — re-read and return
 *      that row instead of throwing
 *
 * The partial unique index lives in migration 00028 and only covers
 * status IN ('pending', 'in_progress') so a user who deletes,
 * re-onboards, and deletes again can still create a fresh request
 * (the prior row's status would be 'complete' and is not under the
 * uniqueness constraint).
 */
export async function requestAccountDeletion(
  admin: SupabaseClient,
  userId: string
): Promise<DeletionRequest> {
  const existing = await readPendingRequest(admin, userId);
  if (existing) return existing;

  const { data, error } = await admin
    .from("deskof_data_deletion_requests")
    .insert({ user_id: userId, status: "pending" })
    .select("*")
    .single();

  if (data) return data as DeletionRequest;

  // The insert may have lost a race. The Postgres unique-violation
  // (23505) means another concurrent request created the row between
  // our SELECT and our INSERT — recover by re-reading.
  const isRace =
    error?.code === PG_UNIQUE_VIOLATION ||
    (error?.message ?? "").includes("duplicate key value");

  if (isRace) {
    const recovered = await readPendingRequest(admin, userId);
    if (recovered) return recovered;
  }

  throw new Error(
    `Failed to create deletion request: ${error?.message ?? "unknown"}`
  );
}

/**
 * Mark a stage of the cascade complete. Used by the scheduled
 * processor to advance state machine across the 1h / 24h / 7d windows.
 */
export async function markDeletionStage(
  admin: SupabaseClient,
  requestId: string,
  stage: "tokens_revoked" | "data_deleted" | "cortex_purged"
): Promise<void> {
  const column =
    stage === "tokens_revoked"
      ? "tokens_revoked_at"
      : stage === "data_deleted"
        ? "data_deleted_at"
        : "cortex_purged_at";

  const { error } = await admin
    .from("deskof_data_deletion_requests")
    .update({ [column]: new Date().toISOString() })
    .eq("id", requestId);

  if (error) {
    throw new Error(`Failed to mark stage ${stage}: ${error.message}`);
  }
}

/**
 * Final transition: mark the entire request complete once all three
 * stages are timestamped.
 */
export async function completeDeletion(
  admin: SupabaseClient,
  requestId: string
): Promise<void> {
  const { error } = await admin
    .from("deskof_data_deletion_requests")
    .update({ status: "complete" })
    .eq("id", requestId);
  if (error) {
    throw new Error(`Failed to complete deletion: ${error.message}`);
  }
}
