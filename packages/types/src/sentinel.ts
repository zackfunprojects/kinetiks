/**
 * Sentinel - Fourth Cortex Operator types.
 * Editorial quality, brand safety, compliance, contact fatigue,
 * and escalation routing.
 */

// ── Verdicts ──

export type SentinelVerdict = "approved" | "flagged" | "held";

export type ReviewResolution =
  | "sent"
  | "revised"
  | "rejected"
  | "overridden";

// ── Content Types ──

export type SentinelContentType =
  | "cold_email"
  | "follow_up_email"
  | "linkedin_connect"
  | "linkedin_dm"
  | "voice_call_script"
  | "voicemail_script"
  | "auto_reply"
  | "meeting_message"
  | "blog_post"
  | "social_post"
  | "newsletter"
  | "seo_content"
  | "landing_page"
  | "personalized_page"
  | "ab_variant"
  | "press_release"
  | "journalist_pitch"
  | "media_response";

// ── Flags ──

export type FlagCategory =
  | "voice_mismatch"
  | "tone_inappropriate"
  | "clarity"
  | "product_inaccuracy"
  | "competitive_claims"
  | "spelling_grammar"
  | "length_inappropriate"
  | "aggressive_competitive"
  | "unsubstantiated_claims"
  | "tone_misjudgment"
  | "cultural_insensitivity"
  | "confidentiality_risk"
  | "impersonation_risk"
  | "legal_exposure"
  | "pressure_manipulation"
  | "compliance_violation"
  | "fatigue_exceeded";

export type FlagSeverity = "none" | "low" | "medium" | "high" | "critical";

export interface SentinelFlag {
  category: FlagCategory;
  severity: FlagSeverity;
  detail: string;
  suggested_action: string | null;
}

// ── Editorial Quality ──

export interface EditorialScores {
  voice_match: number;
  tone: number;
  clarity: number;
  product_accuracy: number;
  competitive_claims: number;
  spelling_grammar: number;
  length: number;
}

export interface EditorialResult {
  scores: EditorialScores;
  composite_score: number;
  flags: SentinelFlag[];
}

// ── Brand Safety ──

export type BrandSafetyCategory =
  | "aggressive_competitive"
  | "unsubstantiated_claims"
  | "tone_misjudgment"
  | "cultural_insensitivity"
  | "confidentiality_risk"
  | "impersonation_risk"
  | "legal_exposure"
  | "pressure_manipulation";

export interface BrandSafetyResult {
  categories: Record<BrandSafetyCategory, FlagSeverity>;
  flags: SentinelFlag[];
  overall_risk: FlagSeverity;
}

// ── Compliance ──

export interface ComplianceRule {
  rule_id: string;
  name: string;
  applies_to: string[];
  passed: boolean;
  detail: string | null;
}

export interface ComplianceCheckResult {
  rules_checked: ComplianceRule[];
  passed: boolean;
  flags: SentinelFlag[];
}

// ── Contact Fatigue ──

export type TouchpointChannel =
  | "email"
  | "linkedin_message"
  | "linkedin_connect"
  | "linkedin_view"
  | "phone_call"
  | "content_retarget"
  | "landing_page_followup";

export type TouchpointSentiment = "positive" | "neutral" | "negative";

export type EngagementLevel = "high" | "normal" | "low" | "negative";

export interface TouchpointRecord {
  id: string;
  account_id: string;
  contact_email: string | null;
  contact_linkedin: string | null;
  org_domain: string | null;
  app: string;
  channel: TouchpointChannel;
  action_type: string;
  sentiment: TouchpointSentiment;
  sentinel_review_id: string | null;
  timestamp: string;
}

export type FatigueRuleScope = "contact" | "org";

export interface FatigueRule {
  id: string;
  account_id: string;
  rule_name: string;
  limit_value: number;
  period: string;
  scope: FatigueRuleScope;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type FatigueDecision = "allowed" | "delayed" | "blocked";

export interface FatigueCheckResult {
  decision: FatigueDecision;
  reason: string | null;
  next_allowed_at: string | null;
  contact_touchpoints_7d: number;
  contact_touchpoints_24h: number;
  org_touchpoints_7d: number;
  engagement_level: EngagementLevel;
  flags: SentinelFlag[];
}

// ── Escalations ──

export type EscalationSeverity = "critical" | "high" | "standard" | "low";

export type EscalationStatus = "pending" | "acknowledged" | "resolved";

export type EscalationDeliveryChannel =
  | "slack_dm"
  | "slack_channel"
  | "digest"
  | "email";

export interface Escalation {
  id: string;
  account_id: string;
  severity: EscalationSeverity;
  source_app: string;
  source_operator: string | null;
  sentinel_review_id: string | null;
  context: Record<string, unknown>;
  status: EscalationStatus;
  delivery_channel: EscalationDeliveryChannel;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

// ── Overrides ──

export type OverrideType = "released" | "tightened";
export type OverrideUserAction = "sent_unchanged" | "edited" | "rejected";

export interface SentinelOverride {
  id: string;
  account_id: string;
  review_id: string;
  override_type: OverrideType;
  user_action: OverrideUserAction;
  edit_diff: string | null;
  created_at: string;
}

// ── Review Records ──

export interface SentinelReview {
  id: string;
  account_id: string;
  source_app: string;
  source_operator: string | null;
  content_type: SentinelContentType;
  content_hash: string;
  content: string;
  quality_score: number | null;
  verdict: SentinelVerdict;
  flags: SentinelFlag[];
  fatigue_check_result: FatigueCheckResult | Record<string, never>;
  compliance_check_result: ComplianceCheckResult | Record<string, never>;
  contact_email: string | null;
  contact_linkedin: string | null;
  org_domain: string | null;
  metadata: Record<string, unknown>;
  reviewed_at: string;
  resolved_at: string | null;
  resolution: ReviewResolution | null;
  created_at: string;
}

// ── API Request/Response ──

export interface ReviewRequest {
  account_id: string;
  source_app: string;
  source_operator?: string;
  content_type: SentinelContentType;
  content: string;
  contact_email?: string;
  contact_linkedin?: string;
  org_domain?: string;
  metadata?: Record<string, unknown>;
}

export interface ReviewResponse {
  review_id: string;
  verdict: SentinelVerdict;
  quality_score: number;
  flags: SentinelFlag[];
  fatigue: FatigueCheckResult | null;
  compliance: ComplianceCheckResult;
}
