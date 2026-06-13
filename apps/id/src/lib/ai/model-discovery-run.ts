/**
 * Model discovery orchestration — the detect → propose half of the loop.
 *
 * Run daily by model-discovery-cron (via the internal route). Reads the
 * live assignment mapping, asks the Anthropic Models API what exists now,
 * and for each role whose family has a strictly-newer model:
 *   1. skip if an open proposal already exists for (role, to_model), or
 *      the operator rejected that same flip within the cooldown window;
 *   2. otherwise record a kinetiks_model_flip_proposals row, raise an
 *      operator-only approval (class `model_flip_proposal`, never
 *      auto-approved, never in a customer queue), notify the operator
 *      (email + Slack DM, best effort), and log `model_flip_proposed`.
 *
 * The flip itself only happens when the operator approves (learning-loop
 * → executeModelFlip). This function never changes the active mapping.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { listAnthropicModels } from "@kinetiks/ai";

import { createAdminClient } from "@/lib/supabase/admin";
import { captureException } from "@/lib/observability/sentry";
import { resolveOwnerEmail, sendSystemEmail } from "@/lib/email/sender";
import { deliverSlackDm } from "@/lib/comms/proactive-delivery";
import { resolveOperatorAccountId } from "./platform-operator";
import {
  selectModelCandidates,
  type AssignmentState,
  type FlipCandidate,
} from "./model-discovery";

/** Don't re-propose a flip the operator declined within this window. */
const REJECTION_COOLDOWN_DAYS = 14;
/** Recent-volume window surfaced in the proposal so the operator can weigh impact. */
const VOLUME_WINDOW_DAYS = 30;

export interface DiscoveryResult {
  candidates: number;
  proposed: number;
  skipped: number;
  /** null when no operator account could be resolved (nothing proposed). */
  operator_account_id: string | null;
}

async function recentVolumeForRole(admin: SupabaseClient, role: string): Promise<number> {
  const since = new Date(Date.now() - VOLUME_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("kinetiks_ai_calls")
    .select("id", { count: "exact", head: true })
    .eq("status", "success")
    .contains("metadata", { model_role: role })
    .gte("started_at", since);
  if (error) return 0;
  return count ?? 0;
}

/** Has the operator rejected this exact (role, to_model) within the cooldown? */
async function inRejectionCooldown(
  admin: SupabaseClient,
  candidate: FlipCandidate,
): Promise<boolean> {
  const cutoff = new Date(
    Date.now() - REJECTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await admin
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

const PG_UNIQUE_VIOLATION = "23505";

export async function runModelDiscovery(): Promise<DiscoveryResult> {
  const admin = createAdminClient() as unknown as SupabaseClient;

  // Current assignment mapping.
  const { data: assignRows, error: assignErr } = await admin
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

  if (candidates.length === 0) {
    return { candidates: 0, proposed: 0, skipped: 0, operator_account_id: null };
  }

  const operatorId = await resolveOperatorAccountId(admin);
  if (!operatorId) {
    // Detected upgrades but nobody to route them to — surface, propose nothing.
    await captureException(
      new Error("model-discovery: no operator account resolved; candidates not proposed"),
      {
        tags: { route: "internal/model-discovery", action: "discovery", stage: "operator", app: "id" },
        extra: { candidate_count: candidates.length },
      },
    );
    return { candidates: candidates.length, proposed: 0, skipped: candidates.length, operator_account_id: null };
  }

  let proposed = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    try {
      if (await inRejectionCooldown(admin, candidate)) {
        skipped += 1;
        continue;
      }

      const releasedAtIso = candidate.released_at_ms
        ? new Date(candidate.released_at_ms).toISOString()
        : null;

      // Record the proposal. The partial unique index on (role, to_model)
      // WHERE status='pending' makes a concurrent duplicate lose with
      // 23505 → skip (operator never sees the same flip twice).
      const { data: propRow, error: propErr } = await admin
        .from("kinetiks_model_flip_proposals")
        .insert({
          role: candidate.role,
          from_model: candidate.from_model,
          to_model: candidate.to_model,
          family: candidate.family,
          released_at: releasedAtIso,
          est_cost_delta_usd: null,
          status: "pending",
        })
        .select("id")
        .maybeSingle();
      if (propErr) {
        if (propErr.code === PG_UNIQUE_VIOLATION) {
          skipped += 1;
          continue;
        }
        throw new Error(`proposal insert failed: ${propErr.message}`);
      }
      const proposalId = (propRow as { id: string } | null)?.id;
      if (!proposalId) {
        skipped += 1;
        continue;
      }

      const volume = await recentVolumeForRole(admin, candidate.role);
      const summary = `A newer model is available for ${candidate.role} tasks: ${candidate.to_model}${
        releasedAtIso ? ` (released ${releasedAtIso.slice(0, 10)})` : ""
      }. It would replace ${candidate.from_model} for every ${candidate.role}-role call (~${volume} in the last ${VOLUME_WINDOW_DAYS} days). Approve to switch; cost impact unconfirmed — verify pricing before approving.`;

      // Operator-only approval. Direct insert (never the auto-approve
      // pipeline): a model flip always requires explicit review.
      const { data: apprRow, error: apprErr } = await admin
        .from("kinetiks_approvals")
        .insert({
          account_id: operatorId,
          source_app: "kinetiks_id",
          source_operator: "model_discovery",
          action_category: "model_flip",
          approval_type: "review",
          approval_class: "model_flip_proposal",
          title: `Model upgrade available: ${candidate.role} → ${candidate.to_model}`,
          description: summary,
          preview: {
            type: "model_flip",
            content: {
              proposal_id: proposalId,
              role: candidate.role,
              from_model: candidate.from_model,
              to_model: candidate.to_model,
              family: candidate.family,
              released_at: releasedAtIso,
              est_cost_delta_usd: null,
            },
          },
          status: "pending",
        })
        .select("id")
        .maybeSingle();
      if (apprErr || !apprRow) {
        throw new Error(`approval insert failed: ${apprErr?.message ?? "no id"}`);
      }
      const approvalId = (apprRow as { id: string }).id;

      const { error: linkErr } = await admin
        .from("kinetiks_model_flip_proposals")
        .update({ approval_id: approvalId })
        .eq("id", proposalId);
      if (linkErr) {
        throw new Error(`proposal↔approval link failed: ${linkErr.message}`);
      }

      // The proposal is logged to the Ledger; a silent PostgREST error
      // here would lose the model_flip_proposed record, so check it.
      const { error: ledgerErr } = await admin.from("kinetiks_ledger").insert({
        account_id: operatorId,
        event_type: "model_flip_proposed",
        source_app: "kinetiks_id",
        source_operator: "model_discovery",
        detail: {
          role: candidate.role,
          from_model: candidate.from_model,
          to_model: candidate.to_model,
          family: candidate.family,
        },
      });
      if (ledgerErr) {
        throw new Error(`model_flip_proposed ledger insert failed: ${ledgerErr.message}`);
      }

      await notifyOperator(operatorId, candidate.role, summary);
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

  return {
    candidates: candidates.length,
    proposed,
    skipped,
    operator_account_id: operatorId,
  };
}

/** Best-effort operator nudge (email + Slack DM). The Approvals queue is
 *  the system of record; this is just the ping. Failures are captured,
 *  never thrown — a missed notification must not fail the proposal. */
async function notifyOperator(operatorId: string, role: string, summary: string): Promise<void> {
  const subject = `Model upgrade ready to review (${role})`;
  try {
    const to = await resolveOwnerEmail(operatorId);
    await sendSystemEmail({
      account_id: operatorId,
      to: [to],
      subject,
      text: `${summary}\n\nReview it in Approvals.`,
      kind: "alert",
    });
  } catch (err) {
    await captureException(err, {
      tags: { route: "internal/model-discovery", action: "notify", stage: "email", app: "id" },
      user: { id: operatorId },
      extra: {},
    });
  }
  try {
    await deliverSlackDm({ account_id: operatorId, body: `${subject}\n${summary}` });
  } catch (err) {
    await captureException(err, {
      tags: { route: "internal/model-discovery", action: "notify", stage: "slack", app: "id" },
      user: { id: operatorId },
      extra: {},
    });
  }
}
