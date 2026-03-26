export interface HvSuppression {
  id: string;
  kinetiks_id: string;
  email: string | null;
  phone: string | null;
  domain: string | null;
  type: string;
  reason: string | null;
  created_at: string;
}

export interface HvConfidenceRow {
  id: string;
  kinetiks_id: string;
  operator: string;
  function_name: string;
  mode: string;
  total_decisions: number;
  user_approved_unchanged: number;
  user_edited: number;
  user_rejected: number;
  agreement_rate: number;
  outcome_score: number;
  outcomes_positive: number;
  outcomes_negative: number;
  min_decisions_for_approvals: number;
  min_decisions_for_autopilot: number;
  min_agreement_for_autopilot: number;
  unlock_eligible: boolean;
  last_calculated: string;
}
