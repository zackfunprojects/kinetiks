/**
 * Harvest Outreach Goal Configuration
 *
 * Defines what this account's outreach is optimizing for,
 * including the conversion action, CTA details, and sales
 * motion preferences.
 *
 * This is Harvest-specific - each Kinetiks app has its own
 * success metric. Dark Madder optimizes for content performance,
 * Harvest optimizes for whatever the user defines here.
 */

export type GoalType =
  | "booked_call"
  | "demo_request"
  | "trial_signup"
  | "reply"
  | "form_submission"
  | "purchase"
  | "custom";

export type SalesMotion =
  | "consultative"   // Relationship-first. Multiple warm touches before ask.
  | "direct"         // Shorter cycle. CTA earlier but still context-aware.
  | "enterprise"     // Long cycle. Heavy research, multi-threaded, no CTA until deep engagement.
  | "product_led"    // Let the product do the talking. Link to trial/demo early.
  | "custom";

export interface OutreachGoal {
  // What counts as a conversion
  goal_type: GoalType;
  goal_label: string;              // User-defined label: "Booked Discovery Call"

  // CTA details
  cta_url: string | null;          // cal.com/daydreamer, app.example.com/demo, etc.
  cta_copy: string | null;         // "Grab 15 minutes" - null means AI generates contextually
  cta_fallback: string | null;     // What to say when CTA isn't appropriate: "happy to share more"

  // Sales motion - controls WHEN the CTA appears
  sales_motion: SalesMotion;

  // Touchpoint rules (based on modern sales best practices)
  rules: OutreachRules;
}

export interface OutreachRules {
  // Cold outreach: no CTA link in first N emails (build relationship first)
  cold_no_cta_touches: number;     // Default: 1 (first email is value-only, no link)

  // Minimum engagement before CTA: require reply/open before sending link
  require_engagement_for_cta: boolean;  // Default: true

  // Max CTA frequency: don't include link in every email even after qualification
  max_cta_ratio: number;           // Default: 0.5 (50% of emails include CTA, others are value-add)

  // Follow-up behavior: after CTA sent, what's the next touch?
  post_cta_behavior: "value_add" | "social_proof" | "breakup" | "mixed";

  // Breakup email: after N unanswered touches, send graceful exit
  breakup_after_touches: number;   // Default: 5

  // Call CTA behavior: AI calls always mention the goal?
  call_always_pitch: boolean;      // Default: false - let conversation flow naturally
}

/**
 * Default outreach goal for new accounts.
 * Conservative defaults based on modern outbound best practices:
 * - First touch is value-only (no link)
 * - Engagement required before CTA
 * - Mix of CTA and value-add emails
 * - Breakup after 5 unanswered touches
 */
export const DEFAULT_OUTREACH_GOAL: OutreachGoal = {
  goal_type: "reply",
  goal_label: "Get a Reply",
  cta_url: null,
  cta_copy: null,
  cta_fallback: "happy to share more if this resonates",
  sales_motion: "consultative",
  rules: {
    cold_no_cta_touches: 1,
    require_engagement_for_cta: true,
    max_cta_ratio: 0.5,
    post_cta_behavior: "value_add",
    breakup_after_touches: 5,
    call_always_pitch: false,
  },
};

/**
 * Determine if a CTA should be included in an outreach at this point
 * in the sequence, given the prospect's engagement history.
 */
export function shouldIncludeCta(
  goal: OutreachGoal,
  touchNumber: number,
  hasEngaged: boolean,
  lastTouchHadCta: boolean,
): { include: boolean; reason: string } {
  // Cold outreach: first N touches are CTA-free
  if (touchNumber <= goal.rules.cold_no_cta_touches) {
    return { include: false, reason: "First touch - building relationship, no CTA" };
  }

  // No CTA URL configured - can't include what doesn't exist
  if (!goal.cta_url) {
    return { include: false, reason: "No CTA URL configured" };
  }

  // Engagement required but prospect hasn't engaged yet
  if (goal.rules.require_engagement_for_cta && !hasEngaged) {
    return { include: false, reason: "Waiting for engagement before including CTA" };
  }

  // Don't include CTA in consecutive emails
  if (lastTouchHadCta) {
    return { include: false, reason: "Previous touch included CTA - alternating with value-add" };
  }

  // CTA ratio check: random but weighted
  // In practice this would track actual CTA ratio across sequence
  // For now, alternate: CTA, value, CTA, value
  const evenTouch = touchNumber % 2 === 0;
  if (goal.rules.max_cta_ratio <= 0.5 && !evenTouch) {
    return { include: false, reason: "Maintaining CTA ratio - this touch is value-add" };
  }

  return { include: true, reason: "Prospect engaged, appropriate timing for CTA" };
}

/**
 * Build the CTA context for email generation prompts.
 * Returns instructions for the AI about how to handle the CTA.
 */
export function buildCtaContext(
  goal: OutreachGoal,
  includeCta: boolean,
  touchNumber: number,
  totalTouches: number,
): string {
  const isBreakup = touchNumber >= goal.rules.breakup_after_touches;

  if (isBreakup) {
    return `This is a breakup email (touch ${touchNumber} of ${totalTouches} with no response). Be gracious and leave the door open. Do NOT include a CTA link. Say something like "I won't keep reaching out, but if this ever becomes relevant, I'm here." Keep it short and dignified.`;
  }

  if (!includeCta) {
    const fallback = goal.cta_fallback ?? "happy to share more if this is relevant";
    return `Do NOT include a scheduling link or direct CTA in this email. This touch is about providing value and building the relationship. End with something soft like "${fallback}" - not a link, not a calendar invite, not a hard ask.`;
  }

  // CTA should be included
  const ctaUrl = goal.cta_url;
  const ctaCopy = goal.cta_copy;
  const goalLabel = goal.goal_label.toLowerCase();

  let instruction = `This email should include a clear but not pushy call-to-action. The goal is: ${goalLabel}.`;

  if (ctaUrl) {
    instruction += ` Include this link naturally in the email: ${ctaUrl}`;
  }
  if (ctaCopy) {
    instruction += ` Suggested CTA phrasing: "${ctaCopy}" - but adapt to the tone of the email.`;
  }

  instruction += ` The CTA should feel like a natural next step, not a hard sell. Place it after providing value, not as the opening line.`;

  return instruction;
}

/**
 * Build call script context based on outreach goal.
 */
export function buildCallGoalContext(
  goal: OutreachGoal,
  hasEngaged: boolean,
): string {
  if (goal.rules.call_always_pitch) {
    return `Your primary objective is to ${goal.goal_label.toLowerCase()}. ${goal.cta_url ? `If they're interested, direct them to: ${goal.cta_url}` : ""}`;
  }

  if (!hasEngaged) {
    return `This is a cold call. Do NOT pitch immediately. Your objective is to have a genuine conversation, understand their situation, and determine if there's a fit. If the conversation goes well and they express interest, mention that you'd love to continue the conversation - ${goal.cta_url ? `suggest they grab time at ${goal.cta_url}` : `suggest scheduling a follow-up`}. But only if it feels natural.`;
  }

  return `This prospect has shown engagement. Your objective is: ${goal.goal_label.toLowerCase()}. Have a consultative conversation and, when appropriate, suggest the next step. ${goal.cta_url ? `Their booking link: ${goal.cta_url}` : ""} Don't force it - let the conversation guide whether the ask is appropriate.`;
}
