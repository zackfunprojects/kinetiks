/**
 * Insight Store types. Mirror of `kinetiks_insights` row shape per the
 * F3 migration. Strict primitives + jsonb everywhere — no PII enters
 * `evidence` or `suggested_action` payloads.
 */

export type InsightType =
  | "anomaly"
  | "trend"
  | "correlation"
  | "opportunity"
  | "risk"
  | "recommendation"
  | "identity_update"
  | "approval_outcome"
  | "authority_change"
  | "pattern_update";

export type InsightSeverity = "info" | "notable" | "urgent";

export type InsightDeliveryChannel =
  | "chat"
  | "analytics"
  | "email"
  | "slack"
  | "push";

export interface Insight {
  id: string;
  account_id: string;
  team_scope_id: string | null;

  type: InsightType;
  severity: InsightSeverity;
  summary: string;

  evidence: Record<string, unknown>;
  suggested_action: Record<string, unknown> | null;

  delivery_channel: InsightDeliveryChannel | null;
  delivered: boolean;
  delivered_at: string | null;
  dismissed: boolean;
  dismissed_at: string | null;
  acted_on: boolean;
  acted_on_at: string | null;

  expires_at: string | null;

  source_app: string;
  source_operator: string | null;
  correlation_id: string | null;
  thread_id: string | null;
  agent_run_id: string | null;
  proposal_id: string | null;
  approval_id: string | null;
  grant_id: string | null;
  pattern_id: string | null;
  ai_call_id: string | null;
  tool_call_id: string | null;

  created_at: string;
  updated_at: string;
}

export interface EmitInsightInput {
  account_id: string;
  type: InsightType;
  severity: InsightSeverity;
  summary: string;
  evidence?: Record<string, unknown>;
  suggested_action?: Record<string, unknown>;
  /** Override the default delivery channel derived from severity. */
  delivery_channel?: InsightDeliveryChannel;
  /** Default expiry by severity per v3 spec; pass null for no expiry. */
  expires_at?: string | null;

  // Correlation
  source_app?: string;
  source_operator?: string;
  correlation_id?: string;
  thread_id?: string;
  agent_run_id?: string;
  proposal_id?: string;
  approval_id?: string;
  grant_id?: string;
  pattern_id?: string;
  ai_call_id?: string;
  tool_call_id?: string;
  team_scope_id?: string | null;
}
