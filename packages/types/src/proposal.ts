import type { ContextLayer } from "./context";

export type ProposalAction = "add" | "update" | "escalate";
export type ProposalConfidence = "validated" | "inferred" | "speculative";
export type ProposalStatus =
  | "submitted"
  | "accepted"
  | "declined"
  | "escalated"
  | "expired"
  | "superseded";

export interface Evidence {
  type: "article" | "metric" | "url" | "user_action" | "analytics" | "conversation";
  value: string;
  context: string;
  date: string | null;
}

export interface Proposal {
  id: string;
  account_id: string;
  source_app: string;
  source_operator: string | null;
  target_layer: ContextLayer;
  action: ProposalAction;
  confidence: ProposalConfidence;
  payload: Record<string, unknown>;
  evidence: Evidence[];
  status: ProposalStatus;
  decline_reason: string | null;
  expires_at: string | null;
  submitted_at: string;
  evaluated_at: string | null;
  evaluated_by: string | null;
}
