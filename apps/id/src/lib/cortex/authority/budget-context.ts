/**
 * Budget snapshot for the §2.11 envelope ≤ Budget-category check — E2.
 *
 * Loads the account's ACTIVE Budget (approval_status='active', the
 * same selection calculateBudgetPacing uses) with its allocations and
 * reduces to remaining-per-category. The Authority Agent threads this
 * into both the proposal prompt (so Sonnet proposes envelopes that
 * fit) and the structural validator (so a proposal that doesn't fit
 * never reaches the customer).
 *
 * `remaining_by_category: null` means no active Budget exists — spend
 * authority is then unproposable ("Budget remains non-negotiable").
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { BudgetValidationContext } from "@/lib/operators/executors/authority-agent/validate";

interface AllocationRow {
  category: string;
  allocated_amount: number | null;
  spent_amount: number | null;
}

export async function loadBudgetValidationContext(
  accountId: string,
): Promise<BudgetValidationContext> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kinetiks_budgets")
    .select("id, kinetiks_budget_allocations(category, allocated_amount, spent_amount)")
    .eq("account_id", accountId)
    .eq("approval_status", "active")
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    // Fail loud: validating spend authority against an unreadable
    // Budget would either falsely block or falsely allow. The executor
    // surfaces this as a proposal failure, not a silent skip.
    throw new Error(
      `[authority/budget-context] active budget read failed: ${error.message}`,
    );
  }
  if (!data) {
    return { remaining_by_category: null };
  }

  const allocations =
    ((data as Record<string, unknown>).kinetiks_budget_allocations as
      | AllocationRow[]
      | null) ?? [];
  const remaining: Record<string, number> = {};
  for (const allocation of allocations) {
    const allocated = Number(allocation.allocated_amount ?? 0);
    const spent = Number(allocation.spent_amount ?? 0);
    // Categories can repeat across apps on one budget; remaining
    // capacity for the category is the sum.
    remaining[allocation.category] =
      (remaining[allocation.category] ?? 0) + Math.max(allocated - spent, 0);
  }
  return { remaining_by_category: remaining };
}
