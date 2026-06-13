/**
 * Model discovery orchestration — the "detect" half of the adaptive model
 * loop. Run daily by model-discovery-cron (via the internal route).
 *
 * Reads the live assignment mapping, asks the Anthropic Models API what
 * exists now, and for each role whose family has a strictly-newer model
 * records a pending row in kinetiks_model_flip_proposals (deduped, with a
 * rejection cooldown). That table IS the operator review queue, surfaced
 * in the /admin panel — discovery no longer touches the customer Approval
 * system or any operator account. The flip itself happens only when an
 * admin approves it in /admin/models.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { listAnthropicModels } from "@kinetiks/ai";

import { createAdminClient } from "@/lib/supabase/admin";
import { captureException } from "@/lib/observability/sentry";
import {
  selectModelCandidates,
  type AssignmentState,
  type FlipCandidate,
} from "./model-discovery";

/** Don't re-propose a flip an admin declined within this window. */
const REJECTION_COOLDOWN_DAYS = 14;
const PG_UNIQUE_VIOLATION = "23505";

export interface DiscoveryResult {
  candidates: number;
  proposed: number;
  skipped: number;
}

/** Has an admin rejected this exact (role, to_model) within the cooldown? */
async function inRejectionCooldown(
  db: SupabaseClient,
  candidate: FlipCandidate,
): Promise<boolean> {
  const cutoff = new Date(
    Date.now() - REJECTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await db
    .from("kinetiks_model_flip_proposals")
    .select("id")
    .eq("role", candidate.role)
    .eq("to_model", candidate.to_model)
    .eq("status", "rejected")
    .gte("decided_at", cutoff)
    .limit(1);
  if (error) return false; // fail-open on the cooldown read; the dedup index still guards dupes
  return (data ?? []).length > 0;
}

export async function runModelDiscovery(): Promise<DiscoveryResult> {
  const db = createAdminClient() as unknown as SupabaseClient;

  const { data: assignRows, error: assignErr } = await db
    .from("kinetiks_model_assignments")
    .select("role, assigned_model_id, frozen");
  if (assignErr) {
    throw new Error(`model-discovery: assignments read failed: ${assignErr.message}`);
  }
  const assignments = (assignRows ?? []) as AssignmentState[];

  // Live model list (throws on API failure → the route surfaces it; we
  // never act on a partial list).
  const models = await listAnthropicModels();
  const candidates = selectModelCandidates(assignments, models);

  let proposed = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    try {
      if (await inRejectionCooldown(db, candidate)) {
        skipped += 1;
        continue;
      }

      const releasedAtIso = candidate.released_at_ms
        ? new Date(candidate.released_at_ms).toISOString()
        : null;

      // The partial unique index on (role, to_model) WHERE status='pending'
      // makes a concurrent duplicate lose with 23505 → skip (an admin never
      // sees the same flip twice).
      const { error: propErr } = await db
        .from("kinetiks_model_flip_proposals")
        .insert({
          role: candidate.role,
          from_model: candidate.from_model,
          to_model: candidate.to_model,
          family: candidate.family,
          released_at: releasedAtIso,
          est_cost_delta_usd: null,
          status: "pending",
        });
      if (propErr) {
        if (propErr.code === PG_UNIQUE_VIOLATION) {
          skipped += 1;
          continue;
        }
        throw new Error(`proposal insert failed: ${propErr.message}`);
      }
      proposed += 1;
    } catch (err) {
      // One bad candidate never stops the run.
      await captureException(err, {
        tags: { route: "internal/model-discovery", action: "discovery", stage: "propose", app: "id" },
        extra: { role: candidate.role, to_model: candidate.to_model },
      });
      skipped += 1;
    }
  }

  return { candidates: candidates.length, proposed, skipped };
}
