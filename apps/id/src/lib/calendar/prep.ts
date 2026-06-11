/**
 * Meeting prep briefs — Phase D4 (comms spec §4.2).
 *
 * For each upcoming meeting in the prep window, generate a short
 * brief from the customer's Cortex context and deliver it ~30 minutes
 * before the start via the proactive channels: email (D2 sender,
 * meetingPrepTemplate), Slack DM (D4 installer mapping), and the
 * in-app alert. Exactly-once per (event, start) via the
 * kinetiks_inbound_events claim table (source 'calendar') — a
 * rescheduled meeting gets a fresh prep because the start time is in
 * the claim key.
 *
 * PII rules: only attendee display names reach the prompt (the
 * events reader already strips addresses); the context summary comes
 * from the same assembly the brief route uses.
 */

import "server-only";

import { askClaude } from "@kinetiks/ai";
import { ToolError } from "@kinetiks/tools";
import { serverEnv } from "@kinetiks/lib/env";

import { assembleContext } from "@/lib/marcus/context-assembly";
import { createInAppAlert, deliverSlackDm } from "@/lib/comms/proactive-delivery";
import { resolveOwnerEmail, sendSystemEmail } from "@/lib/email/sender";
import { meetingPrepTemplate } from "@/lib/email/templates";
import { listUpcomingEvents, type UpcomingCalendarEvent } from "@/lib/calendar/events";
import { captureException } from "@/lib/observability/sentry";
import { createAdminClient } from "@/lib/supabase/admin";

const PG_UNIQUE_VIOLATION = "23505";
/** Prep meetings starting between 25 and 40 minutes out (the cron runs every 15). */
const WINDOW_START_MINUTES = 25;
const WINDOW_END_MINUTES = 40;

export interface MeetingPrepResult {
  status: "ran" | "no_connection";
  events_in_window: number;
  briefs_sent: number;
  duplicates: number;
  failures: number;
}

function buildPrepPrompt(args: {
  event: UpcomingCalendarEvent;
  contextSummary: string;
}): string {
  const attendees = args.event.attendee_names.join(", ") || "no listed attendees";
  return `You prepare a meeting brief for a GTM operator. Be concise and useful: 4-7 sentences of prep plus 2-3 suggested talking points. Plain language, no headers, no em dashes.

Meeting: "${args.event.title}" starting ${args.event.start}, attendees: ${attendees}.

What the system knows about the business (context summary):
"""
${args.contextSummary.slice(0, 4000)}
"""

Write the prep brief now. If the context says nothing relevant to these attendees, say what IS known and suggest sensible generic prep - never invent specifics.`;
}

export async function runMeetingPrep(accountId: string): Promise<MeetingPrepResult> {
  const result: MeetingPrepResult = {
    status: "ran",
    events_in_window: 0,
    briefs_sent: 0,
    duplicates: 0,
    failures: 0,
  };
  const admin = createAdminClient();

  let events: UpcomingCalendarEvent[];
  try {
    const now = Date.now();
    events = await listUpcomingEvents({
      account_id: accountId,
      from: new Date(now + WINDOW_START_MINUTES * 60_000),
      to: new Date(now + WINDOW_END_MINUTES * 60_000),
      max: 5,
    });
  } catch (err) {
    if (err instanceof ToolError && err.errorClass === "unavailable") {
      return { ...result, status: "no_connection" };
    }
    throw err;
  }
  result.events_in_window = events.length;
  if (events.length === 0) return result;

  const contextSummary = await assembleContext(admin, accountId, "strategic");
  const appUrl = serverEnv().NEXT_PUBLIC_APP_URL ?? "https://kinetiks.ai";
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("system_name")
    .eq("id", accountId)
    .maybeSingle();
  const systemName =
    typeof account?.system_name === "string" && account.system_name.trim()
      ? account.system_name.trim()
      : "Kinetiks";

  for (const event of events) {
    // Exactly-once per (event, start): reschedules re-prep.
    const { error: claimError } = await admin.from("kinetiks_inbound_events").insert({
      account_id: accountId,
      source: "calendar",
      event_key: `gcal_prep:${accountId}:${event.id}:${event.start}`,
      event_type: "meeting_prep_sent",
    });
    if (claimError) {
      if (claimError.code === PG_UNIQUE_VIOLATION) {
        result.duplicates += 1;
        continue;
      }
      throw new Error(`prep claim failed: ${claimError.message}`);
    }

    try {
      const brief = await askClaude(buildPrepPrompt({ event, contextSummary }), {
        model: "claude-haiku-4-5-20251001",
        maxTokens: 512,
      });

      const startLabel = new Date(event.start).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      const attendeeLine = event.attendee_names.join(", ") || "you";

      // Email leg (best-effort; the in-app alert is the floor).
      let emailSent = false;
      try {
        const rendered = meetingPrepTemplate({
          systemName,
          appUrl,
          meetingTitle: event.title,
          meetingTime: startLabel,
          attendees: attendeeLine,
          prepBrief: brief,
        });
        const ownerEmail = await resolveOwnerEmail(accountId);
        await sendSystemEmail({
          account_id: accountId,
          to: [ownerEmail],
          subject: rendered.subject,
          text: `${event.title} at ${startLabel} with ${attendeeLine}\n\n${brief}`,
          html: rendered.html,
          kind: "summary",
        });
        emailSent = true;
      } catch (err) {
        await captureException(err, {
          tags: {
            route: "/api/internal/calendar/meeting-prep",
            action: "calendar.prep",
            stage: "email_send",
            app: "id",
          },
          user: { id: accountId },
          extra: { event_id: event.id },
        });
      }

      // Slack DM leg (best-effort).
      let slackSent = false;
      try {
        const outcome = await deliverSlackDm({
          account_id: accountId,
          body: `*Prep: ${event.title}* (${startLabel}, with ${attendeeLine})\n\n${brief}`,
        });
        slackSent = outcome === "sent";
      } catch (err) {
        await captureException(err, {
          tags: {
            route: "/api/internal/calendar/meeting-prep",
            action: "calendar.prep",
            stage: "slack_send",
            app: "id",
          },
          user: { id: accountId },
          extra: { event_id: event.id },
        });
      }

      // In-app alert: the floor that always lands.
      await createInAppAlert({
        account_id: accountId,
        title: `Prep: ${event.title} at ${startLabel}`,
        body: brief,
        severity: "info",
        trigger_type: "gap",
        delivered_via: [
          "in_app",
          ...(emailSent ? ["email"] : []),
          ...(slackSent ? ["slack"] : []),
        ],
      });

      result.briefs_sent += 1;
    } catch (err) {
      result.failures += 1;
      await captureException(err, {
        tags: {
          route: "/api/internal/calendar/meeting-prep",
          action: "calendar.prep",
          stage: "generate",
          app: "id",
        },
        user: { id: accountId },
        extra: { event_id: event.id },
      });
    }
  }

  return result;
}
