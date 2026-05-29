import "server-only";

import type { KineticsAppManifest } from "@kinetiks/types";
import { kinetiksIdActionClassDescriptors } from "@/lib/action-classes/seeds/kinetiks-id";

/**
 * Kinetiks Core manifest per the platform contract and the Kinetiks
 * Contract Addendum §2.6.
 *
 * Kinetiks Core itself participates in the manifest contract — its
 * action classes (Slack notify, draft email, calendar event) are
 * registered alongside any suite app's classes, and its default
 * standing grants are proposed at signup the same way a suite app's
 * defaults are proposed at first-connect.
 *
 * Two defaults declared (v1):
 *
 *   1. `marcus_proactive_slack_notifications` — Marcus can DM the
 *      customer with proactive observations. Capability:
 *      `kinetiks_id.send_slack_notification` with channels="any",
 *      max_message_length=4000, threading_allowed=true, rate 10/day.
 *
 *   2. `marcus_email_drafts` — Marcus can draft emails to the
 *      customer's Drafts folder (never sends). Capability:
 *      `kinetiks_id.draft_email` with max_recipients=10,
 *      max_body_chars=8000, allowed_from_addresses="any",
 *      attachments_allowed=false, rate 15/day.
 *
 * Calendar (`kinetiks_id.add_calendar_event`) is deliberately NOT a
 * default — the action class itself has
 * `available_in_default_standing_grants: false` in the seed
 * descriptor at `seeds/kinetiks-id.ts:138`. Calendar events notify
 * attendees on save, surfacing external state in a way Slack DMs do
 * not. The customer must explicitly grant calendar authority.
 *
 * Both rate limits are at or below the action class's
 * `rate_limit_default` per the manifest validator's rule (defaults
 * never exceed the action class's recommended cap).
 *
 * The validator at `apps/id/src/lib/manifest/validate.ts` runs at app
 * boot and verifies every assertion above. A malformed manifest is a
 * boot failure, never a runtime surprise.
 */
export const kinetiksIdManifest: KineticsAppManifest = {
  app: "kinetiks_id",
  display: {
    name: "Kinetiks Core",
    tagline: "GTM operating system",
    color: "var(--kt-accent)",
  },
  action_classes: kinetiksIdActionClassDescriptors,
  default_standing_grants: [
    {
      key: "marcus_proactive_slack_notifications",
      description:
        "Let your system message you on Slack with proactive observations and reminders.",
      granted_capabilities: [
        {
          action_class: "kinetiks_id.send_slack_notification",
          description:
            "Send you Slack DMs with observations, reminders, and digest summaries.",
          constraints: {
            channels: "any",
            users: "any",
            max_message_length: 4000,
            threading_allowed: true,
          },
          rate_limit: { count: 10, window: "day" },
        },
      ],
      escalation_triggers: [],
      expires_at: null,
    },
    {
      key: "marcus_email_drafts",
      description:
        "Let your system draft emails to your drafts folder for you to review and send.",
      granted_capabilities: [
        {
          action_class: "kinetiks_id.draft_email",
          description:
            "Draft emails into your Gmail or Outlook drafts folder. Drafts never send automatically — you review and send from your email client.",
          constraints: {
            max_recipients: 10,
            max_body_chars: 8000,
            allowed_from_addresses: "any",
            attachments_allowed: false,
          },
          rate_limit: { count: 15, window: "day" },
        },
      ],
      escalation_triggers: [],
      expires_at: null,
    },
  ],
};
