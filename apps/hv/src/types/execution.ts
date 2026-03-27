export type EnrollmentStatus =
  | "active"
  | "paused"
  | "completed"
  | "bounced"
  | "replied"
  | "unsubscribed";

export interface HvEnrollment {
  id: string;
  kinetiks_id: string;
  contact_id: string;
  sequence_id: string;
  campaign_id: string | null;
  current_step: number;
  status: EnrollmentStatus;
  next_step_at: string | null;
  started_at: string;
  completed_at: string | null;
  paused_at: string | null;
  created_at: string;
}

export interface EnrollResult {
  enrollment_id: string;
  contact_id: string;
  next_step_at: string | null;
}

export interface EnrollBatchResult {
  enrolled: number;
  skipped: number;
  results: EnrollResult[];
}

export interface StepExecutionResult {
  enrollment_id: string;
  step_index: number;
  step_type: string;
  action: "executed" | "delayed" | "condition_met" | "condition_not_met" | "completed" | "error";
  detail: string;
}
