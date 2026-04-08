/**
 * Reply persistence + posting orchestrator.
 *
 * Handles draft creation, gate result storage, the human-confirmation
 * dance, and the actual platform-side post via the unified
 * PlatformInterface (or browser handoff for Quora).
 *
 * Phase 2 ships:
 *   - Draft create / update with monotonic revision enforcement
 *   - Stub gate result (clear) — Phase 3 wires the real Lens engine
 *   - Quora browser handoff (no Reddit posting yet — that lands when
 *     the Reddit API client follow-up merges)
 *   - Frozen draft semantics: once a row enters posted / removed /
 *     ready+pending Quora handoff state, draft autosaves no longer
 *     mutate the content / fingerprint / status. The fingerprint is
 *     what Pulse matches against the Quora answer page in the 3-layer
 *     match flow, so we MUST NOT let a late autosave change it after
 *     the user has handed off.
 *
 * The DB-level constraint reply_requires_human_confirmation is the
 * second line of defense: even if the API layer is bypassed,
 * posted_at cannot be set without human_confirmed_at being set within
 * the prior 5 minutes.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  GateResult,
  Platform,
  ReplyStatus,
  Reply,
} from "@kinetiks/deskof";
import { normalizeForFingerprint } from "@kinetiks/deskof";
import { createHash } from "crypto";

interface UpsertDraftInput {
  user_id: string;
  opportunity_id: string;
  platform: Platform;
  thread_url: string;
  content: string;
  gate_result: GateResult;
  gate_overrides: string[];
  /**
   * Monotonic revision counter from the editor. The server rejects
   * upserts whose revision is older than the persisted value (out-of-
   * order autosave defense).
   */
  revision: number;
}

export type UpsertDraftResult =
  | { kind: "saved"; reply: Reply }
  | { kind: "stale"; current_revision: number }
  | { kind: "frozen"; status: ReplyStatus };

/** Phase 2 stub gate result — Phase 3 replaces this with real Lens output. */
export const PASS_THROUGH_GATE_RESULT: GateResult = {
  status: "clear",
  checks: [],
  advisory_only: true,
};

/** Statuses where draft autosaves are no longer allowed to mutate the row. */
const FROZEN_STATUSES: ReadonlySet<ReplyStatus> = new Set<ReplyStatus>([
  "posted",
  "removed",
  "untracked",
]);

function fingerprint(content: string): string {
  const normalized = normalizeForFingerprint(content);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

interface ExistingDraftRow {
  id: string;
  status: ReplyStatus;
  draft_revision: number;
  human_confirmed_at: string | null;
  quora_match_status: string | null;
}

/**
 * Create or update a draft reply for an opportunity.
 *
 * Concurrency model:
 *   1. Read the existing row (if any) for status + revision + handoff state
 *   2. If status is in FROZEN_STATUSES → refuse to mutate (returns "frozen")
 *   3. If a Quora handoff is already pending (human_confirmed_at set)
 *      → also refuse, since Pulse is matching against the existing
 *        fingerprint
 *   4. If incoming revision < persisted revision → out-of-order, return "stale"
 *   5. Otherwise upsert with the new revision
 */
export async function upsertDraftReply(
  supabase: SupabaseClient,
  input: UpsertDraftInput
): Promise<UpsertDraftResult> {
  const { data: existing, error: readError } = await supabase
    .from("deskof_replies")
    .select("id, status, draft_revision, human_confirmed_at, quora_match_status")
    .eq("user_id", input.user_id)
    .eq("opportunity_id", input.opportunity_id)
    .maybeSingle();

  if (readError) {
    throw new Error(`upsertDraftReply read failed: ${readError.message}`);
  }

  if (existing) {
    const row = existing as ExistingDraftRow;
    if (FROZEN_STATUSES.has(row.status)) {
      return { kind: "frozen", status: row.status };
    }
    // Quora handoff has begun — Pulse is matching against the current
    // fingerprint. Don't let a late autosave change content underneath it.
    if (row.human_confirmed_at !== null && input.platform === "quora") {
      return { kind: "frozen", status: row.status };
    }
    if (input.revision <= row.draft_revision) {
      return { kind: "stale", current_revision: row.draft_revision };
    }
  }

  const { data, error } = await supabase
    .from("deskof_replies")
    .upsert(
      {
        user_id: input.user_id,
        opportunity_id: input.opportunity_id,
        platform: input.platform,
        thread_url: input.thread_url,
        content: input.content,
        content_fingerprint: fingerprint(input.content),
        gate_result: input.gate_result,
        gate_overrides: input.gate_overrides,
        status: "ready" satisfies ReplyStatus,
        draft_revision: input.revision,
      },
      { onConflict: "user_id,opportunity_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `upsertDraftReply failed: ${error?.message ?? "no data"}`
    );
  }

  return { kind: "saved", reply: data as Reply };
}

/**
 * Mark a draft reply as posted. Sets posted_at + human_confirmed_at
 * + platform_reply_id atomically. The DB constraint enforces:
 *
 *   posted_at IS NULL OR (
 *     human_confirmed_at IS NOT NULL
 *     AND human_confirmed_at <= posted_at
 *     AND posted_at <= human_confirmed_at + interval '5 minutes'
 *   )
 *
 * This update path is service-role only (the column-level UPDATE
 * grants on these fields were revoked from the authenticated role
 * in migration 00025).
 */
export async function markReplyPosted(
  supabase: SupabaseClient,
  opts: {
    user_id: string;
    opportunity_id: string;
    platform_reply_id: string;
    confirmed_at: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from("deskof_replies")
    .update({
      status: "posted" satisfies ReplyStatus,
      human_confirmed_at: opts.confirmed_at,
      posted_at: new Date().toISOString(),
      platform_reply_id: opts.platform_reply_id,
    })
    .eq("user_id", opts.user_id)
    .eq("opportunity_id", opts.opportunity_id);

  if (error) {
    throw new Error(`markReplyPosted failed: ${error.message}`);
  }
}

/**
 * Mark a Quora handoff confirmation pending — the user has been given
 * the clipboard text + URL but has not yet confirmed they posted on
 * Quora. Pulse will pick up confirmation via the 3-layer match flow
 * once the user taps "I posted this" in the UI.
 *
 * After this point, draft autosaves for the same row are frozen
 * (see FROZEN_STATUSES handling in upsertDraftReply).
 */
export async function markQuoraHandoffPending(
  supabase: SupabaseClient,
  opts: {
    user_id: string;
    opportunity_id: string;
    confirmed_at: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from("deskof_replies")
    .update({
      human_confirmed_at: opts.confirmed_at,
      status: "ready" satisfies ReplyStatus,
      quora_match_status: "pending",
    })
    .eq("user_id", opts.user_id)
    .eq("opportunity_id", opts.opportunity_id);

  if (error) {
    throw new Error(`markQuoraHandoffPending failed: ${error.message}`);
  }
}
