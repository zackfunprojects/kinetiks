export type CallStatus = "scheduled" | "in_progress" | "completed" | "failed" | "cancelled";

export type CallOutcome = "connected" | "voicemail" | "no_answer" | "busy" | "wrong_number";

export interface HvCall {
  id: string;
  kinetiks_id: string;
  contact_id: string;
  org_id: string | null;
  campaign_id: string | null;
  sequence_id: string | null;
  step_number: number | null;
  phone_from: string;
  phone_to: string;
  call_type: string;
  status: CallStatus;
  duration_seconds: number;
  transcript: string | null;
  key_moments: Record<string, unknown>[];
  outcome: CallOutcome | null;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}
