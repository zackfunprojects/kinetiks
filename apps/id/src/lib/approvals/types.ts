// ── Approval System Types ────────────────────────────────────────

export type ApprovalType = "quick" | "review" | "strategic";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "auto_approved"
  | "flagged";

export type ActionCategory =
  | "outbound_email_followup"
  | "outbound_email_cold"
  | "outbound_sequence_launch"
  | "content_publish"
  | "content_draft"
  | "social_post"
  | "pr_pitch"
  | "targeting_change"
  | "sequence_adjustment"
  | "brief_generation"
  | "context_update_minor"
  | "context_update_major"
  | (string & {}); // Allow custom categories

export type OverrideRule = "always_approve" | "always_ask" | "confidence_based";

export type PreviewType =
  | "email"
  | "content"
  | "sequence"
  | "prospect_list"
  | "pitch"
  | "social_post"
  | "config_change"
  | "budget";

export type EditClassificationType =
  | "tone_adjustment"
  | "factual_correction"
  | "targeting_adjustment"
  | "structural_change"
  | "minor_polish";

// ── Submission (what apps send to the pipeline) ──────────────────

export interface ApprovalSubmission {
  source_app: string;
  source_operator: string;
  action_category: ActionCategory;
  title: string;
  description: string;
  preview: ApprovalPreview;
  deep_link: string;
  agent_confidence: number; // 0-100
  changes_strategy: boolean;
  affects_multiple_outputs: boolean;
  content_length: number;
  expires_in_hours: number | null;
}

export interface ApprovalPreview {
  type: PreviewType;
  content: Record<string, unknown>;
}

// ── Database Records ─────────────────────────────────────────────

export interface ApprovalRecord {
  id: string;
  account_id: string;
  source_app: string;
  source_operator: string | null;
  action_category: ActionCategory;
  approval_type: ApprovalType;
  title: string;
  description: string | null;
  preview: ApprovalPreview;
  deep_link: string | null;
  status: ApprovalStatus;
  confidence_score: number | null;
  confidence_breakdown: ConfidenceBreakdown | null;
  auto_approved: boolean;
  user_edits: Record<string, unknown> | null;
  rejection_reason: string | null;
  rejection_classification: string | null;
  edit_classification: EditClassification[] | null;
  brand_gate_result: GateResult | null;
  quality_gate_result: GateResult | null;
  expires_at: string | null;
  created_at: string;
  acted_at: string | null;
}

export interface ApprovalThreshold {
  id: string;
  account_id: string;
  action_category: ActionCategory;
  auto_approve_threshold: number;
  override_rule: OverrideRule | null;
  consecutive_approvals: number;
  total_approvals: number;
  total_rejections: number;
  approval_rate: number;
  edit_rate: number;
  last_rejection_at: string | null;
  updated_at: string;
}

// ── Confidence ───────────────────────────────────────────────────

export interface ConfidenceInputs {
  cortex_confidence: number; // 0-100 aggregate from Context Structure
  category_history: CategoryHistory;
  action_specificity: number; // 0-100
  agent_confidence: number; // 0-100
}

export interface CategoryHistory {
  approval_count: number;
  approval_rate: number; // 0-100
  edit_rate: number; // 0-100
  consecutive_clean: number;
  last_rejection_at: string | null;
}

export interface ConfidenceBreakdown {
  cortex: number;
  category: number;
  specificity: number;
  agent: number;
}

export interface ConfidenceResult {
  score: number;
  breakdown: ConfidenceBreakdown;
  auto_approve: boolean;
  reason: string;
}

// ── Actions ──────────────────────────────────────────────────────

export interface ApprovalAction {
  approval_id: string;
  action: "approve" | "reject";
  edits: Record<string, unknown> | null;
  rejection_reason: string | null;
}

export interface BatchApproveResult {
  approved_count: number;
  approval_ids: string[];
}

// ── Gates ────────────────────────────────────────────────────────

export interface GateResult {
  passed: boolean;
  feedback: string | null;
  revision_count: number;
  details: Record<string, unknown>;
}

// ── Edit Analysis ────────────────────────────────────────────────

export interface EditClassification {
  edit_type: EditClassificationType;
  description: string;
  field_path: string;
  proposal_generated: boolean;
}

// ── Events ───────────────────────────────────────────────────────

export type ApprovalEventType =
  | "approval_created"
  | "approval_auto_approved"
  | "approval_approved"
  | "approval_approved_with_edits"
  | "approval_rejected"
  | "approval_expired"
  | "approval_flagged"
  | "approval_batch_approved"
  | "threshold_calibrated"
  | "threshold_override";

export interface ApprovalEvent {
  type: ApprovalEventType;
  approval_id: string;
  account_id: string;
  action_category: ActionCategory;
  metadata: Record<string, unknown>;
  timestamp: string;
}

// ── Pipeline Result ──────────────────────────────────────────────

export interface PipelineResult {
  approval_id: string;
  auto_approved: boolean;
  approval_type: ApprovalType;
  confidence_score: number;
  brand_gate: GateResult;
  quality_gate: GateResult;
}

// ── Default Thresholds ───────────────────────────────────────────

export const DEFAULT_THRESHOLDS: Record<string, number> = {
  outbound_email_followup: 100,
  outbound_email_cold: 100,
  outbound_sequence_launch: 100,
  content_publish: 100,
  content_draft: 85,
  social_post: 100,
  pr_pitch: 100,
  targeting_change: 100,
  sequence_adjustment: 90,
  brief_generation: 50,
  context_update_minor: 60,
  context_update_major: 100,
};
