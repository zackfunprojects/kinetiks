/**
 * Meeting-prep prompt builder — Phase D4 (comms spec §4.2).
 *
 * Lives with the other apps/id prompt builders (marcus-brief.ts et
 * al.) per the prompts-are-pinned-in-git rule, instead of inline in
 * the prep module (CR). Inputs are already PII-reduced by the
 * callers: attendee display identities only (events.ts strips
 * addresses), and the context summary is the same assembly the brief
 * prompts consume.
 */

import type { UpcomingCalendarEvent } from "@/lib/calendar/events";

export function buildMeetingPrepPrompt(args: {
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
