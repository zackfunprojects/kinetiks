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

/**
 * Insert a fresh deletion request row. Idempotent: if the user already
 * has a pending request, returns the existing row.
 */
export async function requestAccountDeletion(
  admin: SupabaseClient,
  userId: string
): Promise<DeletionRequest> {
  // Check for existing in-flight request
  const { data: existing } = await admin
    .from("deskof_data_deletion_requests")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["pending", "in_progress"])
    .maybeSingle();

  if (existing) {
    return existing as DeletionRequest;
  }

  const { data, error } = await admin
    .from("deskof_data_deletion_requests")
    .insert({ user_id: userId, status: "pending" })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to create deletion request: ${error?.message ?? "unknown"}`
    );
  }

  return data as DeletionRequest;
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
