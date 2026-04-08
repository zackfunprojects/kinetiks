/**
 * Reply persistence + posting orchestrator.
 *
 * Handles draft creation, gate result storage, the human-confirmation
 * dance, and the actual platform-side post via the unified
 * PlatformInterface (or browser handoff for Quora).
 *
 * Phase 2 ships:
 *   - Draft create / update
 *   - Stub gate result (clear) — Phase 3 wires the real Lens engine
 *   - Quora browser handoff (no Reddit posting yet — that lands when
 *     the Reddit API client follow-up merges)
 *
 * The DB-level constraint reply_requires_human_confirmation is the
 * second line of defense: even if the API layer is bypassed, posted_at
 * cannot be set without human_confirmed_at being set within the prior
 * 5 minutes.
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
}

/** Phase 2 stub gate result — Phase 3 replaces this with real Lens output. */
export const PASS_THROUGH_GATE_RESULT: GateResult = {
  status: "clear",
  checks: [],
  advisory_only: true,
};

function fingerprint(content: string): string {
  const normalized = normalizeForFingerprint(content);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Create or update a draft reply for an opportunity. The DB upsert is
 * keyed by (user_id, opportunity_id) so the user can keep editing.
 */
export async function upsertDraftReply(
  supabase: SupabaseClient,
  input: UpsertDraftInput
): Promise<Reply> {
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

  return data as Reply;
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
