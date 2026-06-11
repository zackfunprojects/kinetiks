/**
 * Calendar reads — Phase D4 (comms spec §4.2).
 *
 * Lists upcoming events through the customer's `calendar` system
 * connection (D1: its own OAuth grant, revocable independently of
 * email). Read-only by design — the spec's safeguard that the system
 * never deletes or modifies existing events holds structurally here;
 * event creation lives in create-via-google.ts behind the
 * grant-gated add_calendar_event tool.
 *
 * No calendar data is stored (spec §4.3): callers consume the list
 * in-flight (meeting prep, scheduling awareness) and persist only
 * their own derived artifacts.
 *
 * Replaces the Phase 6 dead module that read plaintext credentials
 * from kinetiks_system_identity.
 */

import "server-only";

import {
  classifyHttpStatus,
  fetchWithTimeout,
  parseJsonOrToolError,
  ToolError,
} from "@kinetiks/tools";

import { getGoogleCalendarAccessToken } from "@/lib/connections/google-workspace-token";

const CALENDAR_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export interface UpcomingCalendarEvent {
  id: string;
  title: string;
  /** ISO start (dateTime; all-day events carry date-only). */
  start: string;
  end: string;
  /** Attendee DISPLAY identities: names where given, else the local part. */
  attendee_names: string[];
  /** Hangout/Meet link when present. */
  conference_link: string | null;
  organizer_self: boolean;
}

interface GoogleEventTime {
  dateTime?: string;
  date?: string;
}

interface GoogleEvent {
  id?: string;
  status?: string;
  summary?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  attendees?: Array<{ email?: string; displayName?: string; self?: boolean; resource?: boolean }>;
  hangoutLink?: string;
  organizer?: { self?: boolean };
}

/**
 * Attendee display identity without the address. Prefer the provided
 * display name; otherwise reduce the local part to its FIRST name
 * token only ("jane.doe.smith@x" → "Jane") per the PII rule's
 * first-name posture (CR: a full local part is name-equivalent and
 * can carry the whole identity).
 */
function attendeeName(attendee: { email?: string; displayName?: string }): string {
  if (attendee.displayName?.trim()) return attendee.displayName.trim();
  const email = attendee.email ?? "";
  const at = email.indexOf("@");
  if (at <= 0) return "guest";
  const first = email.slice(0, at).split(/[._\-+]/)[0] ?? "";
  if (!first) return "guest";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Events on the primary calendar within [from, to). Cancelled and
 * resource (room) entries are dropped.
 */
export async function listUpcomingEvents(args: {
  account_id: string;
  from: Date;
  to: Date;
  max?: number;
}): Promise<UpcomingCalendarEvent[]> {
  const token = await getGoogleCalendarAccessToken({ account_id: args.account_id });

  const url = new URL(CALENDAR_EVENTS_URL);
  url.searchParams.set("timeMin", args.from.toISOString());
  url.searchParams.set("timeMax", args.to.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", String(args.max ?? 10));

  const response = await fetchWithTimeout({
    url: url.toString(),
    init: { headers: { Authorization: `${token.token_type} ${token.access_token}` } },
    tool: "calendar_events_list",
    context: { account_id: args.account_id },
  });
  const json = await parseJsonOrToolError<{ items?: GoogleEvent[] }>(response, {
    tool: "calendar_events_list",
    context: { account_id: args.account_id },
  });
  if (!response.ok) {
    throw new ToolError(
      classifyHttpStatus(response.status),
      `Calendar events.list returned HTTP ${response.status}`,
      { context: { account_id: args.account_id, http_status: response.status } },
    );
  }

  return (json.items ?? [])
    .filter((event) => event.status !== "cancelled" && typeof event.id === "string")
    .map((event) => ({
      id: event.id as string,
      title: event.summary?.trim() || "(untitled)",
      start: event.start?.dateTime ?? event.start?.date ?? "",
      end: event.end?.dateTime ?? event.end?.date ?? "",
      attendee_names: (event.attendees ?? [])
        .filter((a) => !a.resource && !a.self)
        .map(attendeeName)
        .slice(0, 10),
      conference_link: event.hangoutLink ?? null,
      organizer_self: event.organizer?.self === true,
    }))
    .filter((event) => event.start !== "");
}
