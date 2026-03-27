import { createAdminClient } from "@/lib/supabase/admin";

export type OperatorMode = "human" | "approvals" | "autopilot";

/** Thresholds for autopilot eligibility. */
const AUTOPILOT_MIN_AGREEMENT_RATE = 0.90;
const AUTOPILOT_MIN_DECISIONS = 50;
const AUTOPILOT_MIN_OUTCOME_SCORE = 0.70;

interface ConfidenceRow {
  id: string;
  kinetiks_id: string;
  operator: string;
  function_name: string;
  mode: string;
  total_decisions: number;
  agreement_rate: number;
  outcome_score: number;
  unlock_eligible: boolean;
}

/**
 * Get the current operator mode for a specific function.
 *
 * If no confidence record exists, defaults to "human".
 * If a mode is explicitly set, returns it.
 */
export async function getOperatorMode(
  accountId: string,
  operator: string,
  functionName: string
): Promise<OperatorMode> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("hv_confidence")
    .select("mode, total_decisions, agreement_rate, outcome_score")
    .eq("kinetiks_id", accountId)
    .eq("operator", operator)
    .eq("function_name", functionName)
    .single();

  if (error || !data) {
    return "human";
  }

  const row = data as Pick<ConfidenceRow, "mode" | "total_decisions" | "agreement_rate" | "outcome_score">;

  // Return the explicitly set mode
  if (row.mode === "human" || row.mode === "approvals" || row.mode === "autopilot") {
    return row.mode;
  }

  return "human";
}

/**
 * Record a user decision (agree/disagree) for an operator function.
 *
 * Updates the running agreement rate and total decision count.
 * Checks autopilot eligibility and flags it (does NOT auto-upgrade).
 */
export async function recordDecision(
  accountId: string,
  operator: string,
  functionName: string,
  agreed: boolean
): Promise<void> {
  const admin = createAdminClient();

  // Fetch current record (include counters for increment)
  const { data: existing } = await admin
    .from("hv_confidence")
    .select("id, total_decisions, agreement_rate, mode, outcome_score, user_approved_unchanged, user_rejected")
    .eq("kinetiks_id", accountId)
    .eq("operator", operator)
    .eq("function_name", functionName)
    .single();

  if (existing) {
    const row = existing as {
      id: string;
      total_decisions: number;
      agreement_rate: number;
      mode: string;
      outcome_score: number;
      user_approved_unchanged: number;
      user_rejected: number;
    };
    const prevTotal = row.total_decisions;
    const newTotal = prevTotal + 1;

    // Running average: new_rate = (old_rate * old_count + new_value) / new_count
    const prevRate = row.agreement_rate / 100; // stored as percentage, compute as decimal
    const newRate = (prevRate * prevTotal + (agreed ? 1 : 0)) / newTotal;
    const newRatePercent = Math.round(newRate * 10000) / 100; // back to percentage with 2 decimals

    // Check autopilot eligibility (flag only, no auto-upgrade)
    const eligible = checkAutopilotEligibility({
      agreement_rate: newRate,
      total_decisions: newTotal,
      outcome_score: row.outcome_score / 100, // stored as percentage
    });

    // Increment the appropriate counter
    const counterUpdate = agreed
      ? { user_approved_unchanged: row.user_approved_unchanged + 1 }
      : { user_rejected: row.user_rejected + 1 };

    const { error: updateError } = await admin
      .from("hv_confidence")
      .update({
        total_decisions: newTotal,
        agreement_rate: newRatePercent,
        unlock_eligible: eligible,
        last_calculated: new Date().toISOString(),
        ...counterUpdate,
      })
      .eq("id", row.id);

    if (updateError) {
      console.error("[modes] Failed to update confidence:", updateError.message);
    }
  } else {
    // Create initial record
    const newRate = agreed ? 100 : 0;
    const { error: insertError } = await admin
      .from("hv_confidence")
      .insert({
        kinetiks_id: accountId,
        operator,
        function_name: functionName,
        mode: "human",
        total_decisions: 1,
        agreement_rate: newRate,
        user_approved_unchanged: agreed ? 1 : 0,
        user_rejected: agreed ? 0 : 1,
        outcome_score: 0,
        outcomes_positive: 0,
        outcomes_negative: 0,
        unlock_eligible: false,
        last_calculated: new Date().toISOString(),
      });

    if (insertError) {
      console.error("[modes] Failed to insert confidence:", insertError.message);
    }
  }
}

/**
 * Check whether an operator function is eligible for autopilot mode.
 *
 * All three thresholds must be met:
 * - agreement_rate > 90% (decimal, e.g. 0.90)
 * - total_decisions > 50
 * - outcome_score > 70% (decimal, e.g. 0.70)
 *
 * Does NOT auto-upgrade - just returns eligibility.
 */
export function checkAutopilotEligibility(row: {
  agreement_rate: number;
  total_decisions: number;
  outcome_score: number;
}): boolean {
  return (
    row.agreement_rate > AUTOPILOT_MIN_AGREEMENT_RATE &&
    row.total_decisions > AUTOPILOT_MIN_DECISIONS &&
    row.outcome_score > AUTOPILOT_MIN_OUTCOME_SCORE
  );
}
