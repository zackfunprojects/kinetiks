/**
 * Email Templates
 *
 * Templates are the building blocks of outreach. They define
 * the structure and intent of an email, with merge fields that
 * get personalized per-contact at send time.
 *
 * Templates are referenced by sequences (each email step points
 * to a template) and can be used directly in compose.
 */

export type TemplateCategory =
  | "cold_outreach"     // First touch to a new prospect
  | "follow_up"         // Subsequent touch in a sequence
  | "breakup"           // Graceful exit after no response
  | "re_engagement"     // Revive a cold conversation
  | "meeting_request"   // Specifically asking for a meeting
  | "value_add"         // Sharing something useful, no ask
  | "referral"          // Asking for or following up on a referral
  | "post_call"         // Follow-up after a call
  | "custom";           // User-defined

export interface MergeField {
  key: string;           // {{first_name}}, {{company}}, {{pain_point}}, etc.
  description: string;
  source: "contact" | "org" | "research" | "custom";
  required: boolean;
}

export interface HvTemplate {
  id: string;
  kinetiks_id: string;
  name: string;
  category: TemplateCategory;
  subject_template: string;      // Subject with merge fields: "Quick thought on {{company}}'s growth"
  body_template: string;         // Body with merge fields + AI instruction blocks
  style_preset_id: string | null;
  merge_fields: MergeField[];
  is_ai_generated: boolean;      // Whether AI created this template
  performance: TemplatePerformance;
  created_at: string;
  updated_at: string;
}

export interface TemplatePerformance {
  times_used: number;
  open_rate: number | null;
  reply_rate: number | null;
  positive_reply_rate: number | null;
  avg_sentiment: number | null;
}

/**
 * Standard merge fields available in all templates.
 * These get resolved at send time from contact/org/research data.
 */
export const STANDARD_MERGE_FIELDS: MergeField[] = [
  { key: "first_name", description: "Contact's first name", source: "contact", required: true },
  { key: "last_name", description: "Contact's last name", source: "contact", required: false },
  { key: "title", description: "Contact's job title", source: "contact", required: false },
  { key: "company", description: "Contact's company name", source: "org", required: false },
  { key: "industry", description: "Company industry", source: "org", required: false },
  { key: "pain_point", description: "Primary pain point from ICP persona match", source: "research", required: false },
  { key: "personalization_hook", description: "AI-generated personalization from research brief", source: "research", required: false },
  { key: "sender_name", description: "Your name", source: "custom", required: true },
  { key: "sender_company", description: "Your company name", source: "custom", required: true },
  { key: "cta_url", description: "Your outreach goal CTA link", source: "custom", required: false },
];

/**
 * AI instruction blocks that can be embedded in templates.
 * These tell the AI to generate content contextually at send time
 * rather than using static text.
 */
export const AI_INSTRUCTION_BLOCKS = {
  personalize: "{{AI: Write a personalized opening based on the contact's company and role}}",
  value_prop: "{{AI: Explain how our product solves their specific pain point}}",
  social_proof: "{{AI: Include a relevant customer story or metric}}",
  cta: "{{AI: Include the CTA based on outreach goal rules}}",
  breakup: "{{AI: Write a graceful breakup that leaves the door open}}",
};
