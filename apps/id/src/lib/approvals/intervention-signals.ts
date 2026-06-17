import { createAdminClient } from "@/lib/supabase/admin";
import { getThreshold } from "./threshold";
import { computeInterventionUpdate } from "./threshold-math";
import { SIGNAL_WEIGHTS, type InterventionSignal } from "./signal-weights";
import type { ActionCategory, ApprovalThreshold } from "./types";

/**
 * Live wiring for the implicit intervention trust signals (§8.3 kill, §9.3
 * undo / grab). The pure registry-driven math lives in `threshold-math`
 * (`computeInterventionUpdate`); this persists the calibrated threshold and
 * writes the signal's dedicated Ledger entry. Deferred from 8.5 to 8.6 (the
 * task drawer / kill switch is where these signals originate).
 *
 * Ledger detail values are Json scalars so the jsonb insert needs no cast.
 */
export interface InterventionSignalOptions {
  /** Defaults to "kinetiks_fixtures" (reference surface). */
  source_app?: string;
  /** Defaults to true (reference surface). */
  is_fixture?: boolean;
  /** Signal-specific fields recorded on the Ledger detail. */
  extra?: Record<string, string | number | boolean | null>;
}

export async function applyInterventionSignal(
  accountId: string,
  category: ActionCategory,
  signal: InterventionSignal,
  options: InterventionSignalOptions = {},
): Promise<ApprovalThreshold> {
  const admin = createAdminClient();
  const weight = SIGNAL_WEIGHTS[signal];

  // ── Calibrate + persist the threshold ──
  const existing = await getThreshold(accountId, category);
  const computed = computeInterventionUpdate({ existing, signal });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    auto_approve_threshold: computed.auto_approve_threshold,
    consecutive_approvals: computed.consecutive_approvals,
    total_approvals: computed.total_approvals,
    total_rejections: computed.total_rejections,
    approval_rate: computed.approval_rate,
  };
  if (computed.last_rejection_at) updates.last_rejection_at = computed.last_rejection_at;

  if (existing.id) {
    await admin.from("kinetiks_approval_thresholds").update(updates).eq("id", existing.id);
  } else {
    await admin.from("kinetiks_approval_thresholds").insert({
      account_id: accountId,
      action_category: category,
      ...updates,
    });
  }

  // ── Ledger entry (only for signals with a dedicated event type) ──
  if (weight.ledgerEventType) {
    await admin.from("kinetiks_ledger").insert({
      account_id: accountId,
      event_type: weight.ledgerEventType,
      source_app: options.source_app ?? "kinetiks_fixtures",
      target_layer: null,
      detail: {
        signal,
        action_category: category,
        threshold_delta: weight.thresholdDelta,
        is_fixture: options.is_fixture ?? true,
        ...(options.extra ?? {}),
      },
      source_operator: "approval_system",
    });
  }

  return getThreshold(accountId, category);
}
