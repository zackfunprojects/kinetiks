import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ActionCategory,
  ApprovalThreshold,
  OverrideRule,
  DEFAULT_THRESHOLDS,
} from "./types";
import { DEFAULT_THRESHOLDS as DEFAULTS } from "./types";
import { computeThresholdUpdate } from "./threshold-math";

// Re-export pure math for callers that want to predict-without-persist.
export {
  computeThresholdUpdate,
  type ThresholdState,
  type ThresholdUpdate,
} from "./threshold-math";

/**
 * Get threshold for an action category. Returns DB record or default.
 */
export async function getThreshold(
  accountId: string,
  category: ActionCategory
): Promise<ApprovalThreshold> {
  const admin = createAdminClient();

  // A missing row is legitimate (first interaction) — use maybeSingle so the
  // absence does not surface as a swallowed PGRST116 error.
  const { data } = await admin
    .from("kinetiks_approval_thresholds")
    .select("*")
    .eq("account_id", accountId)
    .eq("action_category", category)
    .maybeSingle();

  if (data) return data as ApprovalThreshold;

  // Return a virtual default (not persisted until first interaction)
  return {
    id: "",
    account_id: accountId,
    action_category: category,
    auto_approve_threshold: DEFAULTS[category] ?? 100,
    override_rule: null,
    consecutive_approvals: 0,
    total_approvals: 0,
    total_rejections: 0,
    approval_rate: 0,
    edit_rate: 0,
    last_rejection_at: null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Check if an action should be auto-approved based on confidence and threshold.
 */
export function shouldAutoApprove(
  threshold: ApprovalThreshold,
  confidenceScore: number,
  approvalType: string
): boolean {
  // Strategic approvals are NEVER auto-approved
  if (approvalType === "strategic") return false;

  // Override rules take precedence
  if (threshold.override_rule === "always_approve") return true;
  if (threshold.override_rule === "always_ask") return false;

  // Confidence-based: score must exceed threshold
  return confidenceScore >= threshold.auto_approve_threshold;
}

/**
 * Calibrate threshold after an approval event. Persists the result.
 * Pure math lives in `./threshold-math` and is unit-tested separately.
 */
export async function calibrateThreshold(
  accountId: string,
  category: ActionCategory,
  event: "approved_clean" | "approved_with_edits" | "rejected"
): Promise<ApprovalThreshold> {
  const admin = createAdminClient();

  // Ensure record exists
  const existing = await getThreshold(accountId, category);

  const recentRejections =
    event === "rejected"
      ? await countRecentRejections(admin, accountId, category, 7)
      : 0;

  const computed = computeThresholdUpdate({ existing, event, recentRejections });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    auto_approve_threshold: computed.auto_approve_threshold,
    consecutive_approvals: computed.consecutive_approvals,
    total_approvals: computed.total_approvals,
    total_rejections: computed.total_rejections,
    approval_rate: computed.approval_rate,
  };
  if (computed.last_rejection_at) {
    updates.last_rejection_at = computed.last_rejection_at;
  }

  // Upsert threshold record
  if (existing.id) {
    await admin
      .from("kinetiks_approval_thresholds")
      .update(updates)
      .eq("id", existing.id);
  } else {
    await admin
      .from("kinetiks_approval_thresholds")
      .insert({
        account_id: accountId,
        action_category: category,
        ...updates,
      });
  }

  return getThreshold(accountId, category);
}

/**
 * User explicitly sets an override rule for a category.
 */
export async function setOverride(
  accountId: string,
  category: ActionCategory,
  rule: OverrideRule
): Promise<void> {
  const admin = createAdminClient();

  await admin
    .from("kinetiks_approval_thresholds")
    .upsert(
      {
        account_id: accountId,
        action_category: category,
        override_rule: rule,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,action_category" }
    );
}

async function countRecentRejections(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  category: ActionCategory,
  days: number
): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { count } = await admin
    .from("kinetiks_approvals")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("action_category", category)
    .eq("status", "rejected")
    .gte("acted_at", since.toISOString());

  return count ?? 0;
}
