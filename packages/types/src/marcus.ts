import type { ContextLayer } from "./context";

// ============================================================
// Database row types
// ============================================================

export interface MarcusThread {
  id: string;
  account_id: string;
  title: string | null;
  channel: MarcusChannel;
  slack_thread_ts: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface MarcusMessage {
  id: string;
  thread_id: string;
  role: "user" | "marcus";
  content: string;
  channel: MarcusChannel;
  extracted_actions: ExtractedAction[] | null;
  context_used: Record<string, unknown> | null;
  created_at: string;
}

export interface MarcusSchedule {
  id: string;
  account_id: string;
  type: MarcusScheduleType;
  channel: MarcusDeliveryChannel;
  schedule: string;
  timezone: string;
  enabled: boolean;
  last_sent_at: string | null;
  next_send_at: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MarcusAlert {
  id: string;
  account_id: string;
  trigger_type: MarcusAlertTrigger;
  severity: "info" | "warning" | "urgent";
  title: string;
  body: string;
  source_app: string | null;
  read: boolean;
  delivered_via: string[];
  created_at: string;
}

export interface MarcusFollowUp {
  id: string;
  account_id: string;
  thread_id: string | null;
  message: string;
  scheduled_for: string;
  delivered: boolean;
  created_at: string;
}

// ============================================================
// Union types
// ============================================================

export type MarcusChannel = "web" | "slack" | "pill";

export type MarcusIntent =
  | "strategic"
  | "tactical"
  | "support"
  | "data_query"
  | "implicit_intel";

export type MarcusScheduleType =
  | "daily_brief"
  | "weekly_digest"
  | "monthly_review";

export type MarcusDeliveryChannel = "slack" | "email" | "both";

export type MarcusAlertTrigger =
  | "kpi_shift"
  | "crisis"
  | "deal_outcome"
  | "anomaly"
  | "gap";

// ============================================================
// Action extraction types
// ============================================================

export interface ExtractedProposal {
  type: "proposal";
  target_layer: ContextLayer;
  action: "add" | "update" | "escalate";
  confidence: "validated" | "inferred" | "speculative";
  payload: Record<string, unknown>;
  evidence_summary: string;
}

export interface ExtractedBrief {
  type: "brief";
  target_app: string;
  content: string;
}

export interface ExtractedFollowUp {
  type: "follow_up";
  message: string;
  delay_hours: number;
}

export type ExtractedAction =
  | ExtractedProposal
  | ExtractedBrief
  | ExtractedFollowUp;

// ============================================================
// Engine types
// ============================================================

export interface MarcusChatRequest {
  message: string;
  thread_id?: string;
  channel?: MarcusChannel;
}

export interface MarcusChatResponse {
  thread_id: string;
  message: string;
  extracted_actions?: ExtractedAction[];
  disclosure?: string;
}

export interface ContextBudget {
  layers: number;
  confidence: number;
  proposals: number;
  routing: number;
  history: number;
  docs: number;
}

export const CONTEXT_BUDGETS: Record<MarcusIntent, ContextBudget> = {
  strategic: {
    layers: 3000,
    confidence: 500,
    proposals: 1500,
    routing: 1000,
    history: 1500,
    docs: 0,
  },
  tactical: {
    layers: 1500,
    confidence: 300,
    proposals: 500,
    routing: 500,
    history: 1000,
    docs: 0,
  },
  support: {
    layers: 500,
    confidence: 200,
    proposals: 0,
    routing: 0,
    history: 500,
    docs: 2000,
  },
  data_query: {
    layers: 1000,
    confidence: 500,
    proposals: 500,
    routing: 500,
    history: 500,
    docs: 0,
  },
  implicit_intel: {
    layers: 2000,
    confidence: 300,
    proposals: 500,
    routing: 0,
    history: 1000,
    docs: 0,
  },
};
