/**
 * Google Calendar create-event dispatcher per Phase 4 — Chunk 6.
 *
 * Creates a calendar event in the customer's Google Calendar via the
 * Calendar v3 REST API (`events.insert`). Unlike the Gmail draft path,
 * creating an event triggers Google's invite notifications to
 * attendees on save — so this tool is gated by an explicit Authority
 * Grant (Phase 4 marks the action class as NOT eligible for default
 * standing grants).
 *
 * Microsoft 365 calendar support is deferred to a follow-up (same
 * provider-wiring gap as the Gmail dispatcher).
 *
 * Per CLAUDE.md PII rules: no attendee addresses or event titles in
 * logs. Errors carry attendee COUNT and event duration in minutes.
 */

import "server-only";

import { ToolError } from "@kinetiks/tools";

import { getGoogleWorkspaceAccessToken } from "@/lib/connections/google-workspace-token";

interface CalendarUrlInput {
  calendar_id: string;
  send_updates: "all" | "externalOnly" | "none";
}

function buildEventsUrl(input: CalendarUrlInput): string {
  const calendarId = encodeURIComponent(input.calendar_id);
  return `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?sendUpdates=${input.send_updates}`;
}

export interface CreateCalendarEventInput {
  account_id: string;
  /** Plain-text event title. */
  title: string;
  /** ISO 8601 start. */
  start_time: string;
  /** ISO 8601 end. */
  end_time: string;
  /** Attendee email addresses. */
  attendees?: string[];
  /** Optional plain-text agenda / description. */
  agenda?: string;
  /** Calendar id; defaults to "primary" if omitted. */
  calendar_id?: string;
  /**
   * "all" sends Google invites to every attendee on save (default).
   * "externalOnly" sends only to attendees outside the org.
   * "none" suppresses invites entirely (useful for personal time-blocks).
   */
  send_updates?: "all" | "externalOnly" | "none";
}

export interface CreateCalendarEventOutput {
  event_id: string;
  /** Google's stable user-facing link to the event. */
  calendar_link: string;
  provider: "google";
  /** Email of the connected Workspace account; safe to log. */
  organizer_email: string;
}

export async function createCalendarEventViaGoogle(
  input: CreateCalendarEventInput,
): Promise<CreateCalendarEventOutput> {
  const token = await getGoogleWorkspaceAccessToken({
    account_id: input.account_id,
  });

  const url = buildEventsUrl({
    calendar_id: input.calendar_id ?? "primary",
    send_updates: input.send_updates ?? "all",
  });

  const body = {
    summary: input.title,
    description: input.agenda ?? "",
    start: { dateTime: input.start_time },
    end: { dateTime: input.end_time },
    attendees: (input.attendees ?? []).map((email) => ({ email })),
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `${token.token_type} ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ToolError(
      "transient",
      `Calendar events.insert network failure: ${(err as Error)?.message ?? "unknown"}`,
      {
        context: {
          tool: "add_calendar_event",
          account_id: input.account_id,
          attendee_count: input.attendees?.length ?? 0,
        },
      },
    );
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errJson = (await response.json()) as {
        error?: { message?: string; status?: string };
      };
      if (errJson?.error?.message) detail = errJson.error.message;
    } catch {
      // body not JSON
    }
    throw new ToolError(
      response.status >= 500 ? "transient" : "permanent",
      `Calendar events.insert rejected: ${detail}`,
      {
        context: {
          tool: "add_calendar_event",
          account_id: input.account_id,
          attendee_count: input.attendees?.length ?? 0,
          http_status: response.status,
        },
      },
    );
  }

  const data = (await response.json()) as {
    id?: string;
    htmlLink?: string;
  };
  if (!data.id) {
    throw new ToolError(
      "permanent",
      "Calendar events.insert succeeded but returned no event id",
      {
        context: {
          tool: "add_calendar_event",
          account_id: input.account_id,
        },
      },
    );
  }
  return {
    event_id: data.id,
    calendar_link: data.htmlLink ?? "",
    provider: "google",
    organizer_email: token.connected_email,
  };
}
