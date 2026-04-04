import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ActionCategory,
  ApprovalThreshold,
  OverrideRule,
  DEFAULT_THRESHOLDS,
} from "./types";
import { DEFAULT_THRESHOLDS as DEFAULTS } from "./types";

/**
 * Get threshold for an action category. Returns DB record or default.
 */
export async function getThreshold(
  accountId: string,
  category: ActionCategory
): Promise<ApprovalThreshold> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("kinetiks_approval_thresholds")
    .select("*")
    .eq("account_id", accountId)
    .eq("action_category", category)
    .single();

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
 * Calibrate threshold after an approval event.
 *
 * Trust expansion: 20 consecutive clean -> -5pts, 50 consecutive -> another -5pts
 * Trust contraction: 1 rejection -> +10pts, 2 in 7 days -> +20pts, 3 in 7 days -> reset to 100
 */
export async function calibrateThreshold(
  accountId: string,
  category: ActionCategory,
  event: "approved_clean" | "approved_with_edits" | "rejected"
): Promise<ApprovalThreshold> {
  const admin = createAdminClient();

  // Ensure record exists
  const existing = await getThreshold(accountId, category);

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (event === "approved_clean") {
    const newConsecutive = existing.consecutive_approvals + 1;
    const newTotal = existing.total_approvals + 1;
    updates.consecutive_approvals = newConsecutive;
    updates.total_approvals = newTotal;
    updates.approval_rate = calculateRate(newTotal, existing.total_rejections);

    // Trust expansion thresholds
    let threshold = existing.auto_approve_threshold;
    if (newConsecutive === 20) threshold = Math.max(threshold - 5, 0);
    if (newConsecutive === 50) threshold = Math.max(threshold - 5, 0);
    updates.auto_approve_threshold = threshold;
  } else if (event === "approved_with_edits") {
    // Edits break the consecutive streak but count as approval
    const newTotal = existing.total_approvals + 1;
    updates.consecutive_approvals = 0;
    updates.total_approvals = newTotal;
    updates.approval_rate = calculateRate(newTotal, existing.total_rejections);
    // edit_rate is updated separately when edit analysis completes
  } else if (event === "rejected") {
    const newRejections = existing.total_rejections + 1;
    updates.consecutive_approvals = 0;
    updates.total_rejections = newRejections;
    updates.last_rejection_at = new Date().toISOString();
    updates.approval_rate = calculateRate(existing.total_approvals, newRejections);

    // Trust contraction
    let threshold = existing.auto_approve_threshold;
    const recentRejections = await countRecentRejections(admin, accountId, category, 7);

    if (recentRejections >= 3) {
      // 3 rejections in 7 days: reset to 100 (always ask)
      threshold = 100;
    } else if (recentRejections >= 2) {
      // 2 in 7 days: +20 and reverse all auto-reductions
      threshold = Math.min(threshold + 20, 100);
    } else {
      // Single rejection: +10
      threshold = Math.min(threshold + 10, 100);
    }
    updates.auto_approve_threshold = threshold;
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

function calculateRate(approvals: number, rejections: number): number {
  const total = approvals + rejections;
  if (total === 0) return 0;
  return Math.round((approvals / total) * 10000) / 100;
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
