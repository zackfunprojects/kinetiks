/**
 * Email style configuration defaults and voice merging.
 */

import type { EmailStyleConfig } from "@/types/composer";

export const DEFAULT_STYLE_CONFIG: EmailStyleConfig = {
  tone: "conversational",
  length: "short",
  cta_style: "quick_question",
  greeting_style: "first_name",
  reference_cc: false,
  include_ps: false,
  address_both_contacts: false,
  link_company_in_signature: false,
  writing_rules: [],
  personal_style: null,
  sample_email: null,
};

/**
 * Adjust email style based on the user's Kinetiks voice layer.
 * The voice layer provides brand tone data that should influence email style.
 */
export function mergeStyleWithVoice(
  style: EmailStyleConfig,
  voiceLayer: Record<string, unknown>
): EmailStyleConfig {
  const merged = { ...style };
  const tone = voiceLayer.tone as Record<string, number> | undefined;
  if (!tone) return merged;

  // If brand voice is very formal, nudge toward formal tone
  if (tone.formality !== undefined && tone.formality > 70 && style.tone === "conversational") {
    merged.tone = "formal";
  }

  // If brand voice is very casual/warm, nudge toward casual
  if (tone.warmth !== undefined && tone.warmth > 75 && tone.formality < 30 && style.tone === "conversational") {
    merged.tone = "casual";
  }

  return merged;
}
