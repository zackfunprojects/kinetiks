/**
 * Outreach Composer domain types.
 * Style system ported from Bloomify, adapted for Kinetiks.
 */

export type Tone = "formal" | "conversational" | "casual";
export type EmailLength = "short" | "medium" | "detailed";
export type CtaStyle = "meeting_request" | "quick_question" | "value_prop" | "soft_intro";
export type GreetingStyle = "first_name" | "full_name" | "title_based";
export type ResearchTier = "none" | "brief" | "deep";

export interface EmailStyleConfig {
  tone: Tone;
  length: EmailLength;
  cta_style: CtaStyle;
  greeting_style: GreetingStyle;
  reference_cc: boolean;
  include_ps: boolean;
  address_both_contacts: boolean;
  link_company_in_signature: boolean;
  writing_rules: string[];
  personal_style: string | null;
  sample_email: string | null;
}

export interface StylePreset {
  id: string;
  kinetiks_id: string;
  name: string;
  config: EmailStyleConfig;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface GenerateEmailRequest {
  contact_id: string;
  cc_contact_id?: string;
  research_brief: ResearchBrief;
  style: EmailStyleConfig;
}

export interface GenerateEmailResponse {
  subject: string;
  body: string;
  body_plain: string;
}

export interface ResearchBrief {
  company_summary: string;
  personalization_hooks: string[];
  relevance_angle: string;
}

export interface EmailDraft {
  id: string;
  kinetiks_id: string;
  contact_id: string;
  cc_contact_id: string | null;
  org_id: string | null;
  subject: string;
  body: string;
  body_plain: string | null;
  research_brief: ResearchBrief | null;
  style_config: EmailStyleConfig | null;
  status: "draft" | "scheduled" | "sent" | "bounced";
  sentinel_verdict: string | null;
  sentinel_flags: unknown[] | null;
  sentinel_quality_score: number | null;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}
