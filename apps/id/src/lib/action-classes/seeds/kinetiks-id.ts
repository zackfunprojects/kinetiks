/**
 * Seed ActionClassDescriptors for Kinetiks Core (apps/id), per Phase 4
 * and the Kinetiks Contract Addendum §2.4.
 *
 * Three v1 action classes — all non-spend-bearing:
 *
 *   1. kinetiks_id.send_slack_notification
 *      Default-eligible. Slack DM / channel post via @kinetiks/ai/slack-dispatcher.
 *
 *   2. kinetiks_id.draft_email
 *      Default-eligible. Drafts via Gmail / Microsoft Graph; never sends.
 *      Carries an llm_judgment_budget for novelty-style escalation.
 *
 *   3. kinetiks_id.add_calendar_event
 *      NOT default-eligible (calendar invites notify attendees; explicit grant only).
 *      Via Google Calendar / Outlook Calendar.
 *
 * All three:
 *   - source_app: "kinetiks_id"
 *   - always_requires_budget_attachment: false
 *   - rate_limit_default capped sensibly per CLAUDE.md "conservative on first three grants"
 *
 * Customer-facing language is enforced at the schema level by
 * `assertActionClassDescriptor()` in packages/tools/src/action-class-registry.ts
 * — the literal phrase "Authority Grant" is rejected pre-registration.
 *
 * Constraint schemas use `z.union([z.array(z.string()), z.literal("any")])`
 * for allowlists. Grants typically cap to a concrete array; the literal
 * "any" is the wide-open default the Authority Agent only proposes for
 * first-connect default standing grants.
 */

import { z } from "zod";
import type { ActionClassDescriptor } from "@kinetiks/types";

// ============================================================
// 1. send_slack_notification
// ============================================================

const slackNotificationConstraintSchema = z.object({
  /** Allowlist of Slack channel IDs, or "any" for unrestricted. */
  channels: z.union([z.array(z.string().min(1)).min(1), z.literal("any")]),
  /** Allowlist of Slack user IDs (for DMs), or "any". */
  users: z.union([z.array(z.string().min(1)).min(1), z.literal("any")]),
  /** Hard cap on message body length; Slack's actual limit is 40k. */
  max_message_length: z.number().int().positive().max(40000),
  /** Whether the tool may post inside a thread. */
  threading_allowed: z.boolean(),
});

export const sendSlackNotificationDescriptor: ActionClassDescriptor = {
  action_class: "kinetiks_id.send_slack_notification",
  source_app: "kinetiks_id",
  description:
    "Send a Slack notification (DM or channel post) on the customer's behalf. Bounded by an explicit channel/user allowlist and a maximum message length. Never bypasses the Slack workspace's own permission model — the bot must already be a member of the channel.",
  constraint_schema: slackNotificationConstraintSchema,
  rate_limit_default: { count: 20, window: "day" },
  customer_template:
    "Send Slack notifications to {channels} on your behalf, up to {max_message_length} characters per message.",
  available_in_default_standing_grants: true,
  always_requires_budget_attachment: false,
};

// ============================================================
// 2. draft_email
// ============================================================

const draftEmailConstraintSchema = z.object({
  /** Maximum number of recipients on a single drafted email. */
  max_recipients: z.number().int().positive().max(200),
  /** Maximum body length (chars). Drafts longer than this require manual rewrite. */
  max_body_chars: z.number().int().positive().max(50000),
  /** Allowlist of From: addresses the drafter may use, or "any" allowed-from. */
  allowed_from_addresses: z.union([
    z.array(z.string().email()).min(1),
    z.literal("any"),
  ]),
  /** Whether the drafter may attach files. False keeps drafts text-only. */
  attachments_allowed: z.boolean(),
});

export const draftEmailDescriptor: ActionClassDescriptor = {
  action_class: "kinetiks_id.draft_email",
  source_app: "kinetiks_id",
  description:
    "Draft an email (subject, body, recipients) into the customer's Gmail or Microsoft Graph drafts folder. NEVER sends — the customer must explicitly send from their email client. Bounded by recipient count, body length, allowed From: addresses, and attachment policy.",
  constraint_schema: draftEmailConstraintSchema,
  rate_limit_default: { count: 30, window: "day" },
  customer_template:
    "Draft emails for your review, with up to {max_recipients} recipients and {max_body_chars}-character bodies. Drafts never send automatically.",
  // Drafts to external parties carry novelty risk (wrong tone, wrong
  // recipient profile, hallucinated facts). The Haiku judgment budget
  // catches obvious misses before the draft lands. v1 caps at $1/day
  // ($20/month) per account-class; grants can override within parent
  // bounds.
  llm_judgment_budget: {
    daily_usd: 1.0,
    monthly_usd: 20.0,
    model: "haiku",
    fallback_on_budget_exhausted: "escalate_to_user",
  },
  llm_judgment_required: true,
  available_in_default_standing_grants: true,
  always_requires_budget_attachment: false,
};

// ============================================================
// 3. add_calendar_event
// ============================================================

const addCalendarEventConstraintSchema = z.object({
  /** Allowlist of Google/Outlook calendar IDs, or "primary_only". */
  calendar_ids: z.union([
    z.array(z.string().min(1)).min(1),
    z.literal("primary_only"),
  ]),
  /** Maximum attendee count on a single event. */
  max_attendees: z.number().int().positive().max(500),
  /** Maximum event duration (minutes). */
  max_duration_minutes: z.number().int().positive().max(24 * 60),
  /** Minimum advance notice before the event starts (minutes). */
  advance_notice_min_minutes: z.number().int().nonnegative().max(60 * 24 * 30),
});

export const addCalendarEventDescriptor: ActionClassDescriptor = {
  action_class: "kinetiks_id.add_calendar_event",
  source_app: "kinetiks_id",
  description:
    "Create a calendar event on the customer's Google Calendar or Microsoft 365 calendar. Sends invites to attendees according to the calendar's settings. Bounded by attendee count, duration, advance notice, and calendar allowlist.",
  constraint_schema: addCalendarEventConstraintSchema,
  rate_limit_default: { count: 5, window: "day" },
  customer_template:
    "Add calendar events on your behalf, up to {max_attendees} attendees and {max_duration_minutes} minutes per event, with at least {advance_notice_min_minutes} minutes of advance notice.",
  // Calendar events notify attendees on save — surfaces external state
  // immediately, unlike Slack notifications scoped to channels/users
  // already on the workspace. v1 excludes from default standing grants;
  // an explicit grant is always required.
  available_in_default_standing_grants: false,
  always_requires_budget_attachment: false,
};

// ============================================================
// Exported pack
// ============================================================

export const kinetiksIdActionClassDescriptors = [
  sendSlackNotificationDescriptor,
  draftEmailDescriptor,
  addCalendarEventDescriptor,
] as const;
