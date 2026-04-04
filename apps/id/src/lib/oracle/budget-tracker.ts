import { createAdminClient } from "@/lib/supabase/admin";
import type { Budget, BudgetAllocation } from "@/lib/goals/types";

export interface BudgetPacing {
  budget_id: string;
  total_budget: number;
  total_spent: number;
  pacing_percentage: number; // How much time has passed
  spend_percentage: number; // How much budget is spent
  on_pace: boolean;
  days_remaining: number;
  projected_total_spend: number;
  allocations: AllocationPacing[];
}

export interface AllocationPacing {
  category: string;
  app: string | null;
  allocated: number;
  spent: number;
  remaining: number;
  pace_status: "under" | "on_pace" | "over";
}

/**
 * Calculate budget pacing for the current active budget.
 */
export async function calculateBudgetPacing(accountId: string): Promise<BudgetPacing | null> {
  const admin = createAdminClient();

  const { data: budget } = await admin
    .from("kinetiks_budgets")
    .select("*, kinetiks_budget_allocations(*)")
    .eq("account_id", accountId)
    .eq("approval_status", "active")
    .order("period_start", { ascending: false })
    .limit(1)
    .single();

  if (!budget) return null;

  const b = budget as Budget & { kinetiks_budget_allocations: BudgetAllocation[] };
  const allocations = b.kinetiks_budget_allocations ?? [];

  const now = new Date();
  const start = new Date(b.period_start);
  const end = new Date(b.period_end);
  const totalDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  const daysElapsed = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  const daysRemaining = Math.max(0, totalDays - daysElapsed);
  const pacingPercentage = Math.min((daysElapsed / totalDays) * 100, 100);

  const totalSpent = allocations.reduce((sum, a) => sum + (a.spent_amount ?? 0), 0);
  const spendPercentage = b.total_budget > 0 ? (totalSpent / b.total_budget) * 100 : 0;
  const projectedSpend = daysElapsed > 0 ? (totalSpent / daysElapsed) * totalDays : 0;

  const allocationPacing: AllocationPacing[] = allocations.map((a) => {
    const spent = a.spent_amount ?? 0;
    const expectedSpend = a.allocated_amount * (pacingPercentage / 100);
    const ratio = expectedSpend > 0 ? spent / expectedSpend : 0;

    let paceStatus: AllocationPacing["pace_status"];
    if (ratio > 1.15) paceStatus = "over";
    else if (ratio < 0.85) paceStatus = "under";
    else paceStatus = "on_pace";

    return {
      category: a.category,
      app: a.app,
      allocated: a.allocated_amount,
      spent,
      remaining: Math.max(0, a.allocated_amount - spent),
      pace_status: paceStatus,
    };
  });

  return {
    budget_id: b.id,
    total_budget: b.total_budget,
    total_spent: totalSpent,
    pacing_percentage: Math.round(pacingPercentage * 100) / 100,
    spend_percentage: Math.round(spendPercentage * 100) / 100,
    on_pace: Math.abs(spendPercentage - pacingPercentage) < 15,
    days_remaining: Math.round(daysRemaining),
    projected_total_spend: Math.round(projectedSpend * 100) / 100,
    allocations: allocationPacing,
  };
}
