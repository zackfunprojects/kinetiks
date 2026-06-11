/**
 * Marcus tool: add_calendar_event per Phase 4 — Chunk 6.
 *
 * Creates a calendar event in the customer's Google Calendar.
 * Google's invite notification fires on save, so this tool is gated
 * by an explicit Authority Grant (NOT eligible for default standing
 * grants per the action class registration).
 *
 * actionClass `kinetiks_id.add_calendar_event` is registered in
 * apps/id/src/lib/action-classes/seeds/kinetiks-id.ts.
 *
 * Microsoft 365 calendar support is a follow-up.
 */

import { z } from "zod";
import { defineTool } from "@kinetiks/tools";

import { createCalendarEventViaGoogle } from "@/lib/calendar/create-via-google";

export const addCalendarEventTool = defineTool({
  name: "add_calendar_event",
  description:
    "Create an event on the customer's Google Calendar. Google sends invites to attendees on save, so this tool is grant-gated and never default-eligible. Use for meetings, time-blocks, and scheduled focus sessions the customer asks you to add.",
  inputSchema: z.object({
    title: z.string().min(1).describe("Plain-text event title."),
    start_time: z.string().datetime().describe("ISO 8601 start."),
    end_time: z.string().datetime().describe("ISO 8601 end."),
    attendees: z
      .array(z.string().email())
      .optional()
      .describe("Optional attendee emails."),
    max_attendees: z
      .number()
      .int()
      .nonnegative()
      .describe(
        "Attendee count. Grant's max_attendees caps this; resolver checks at resolution time.",
      ),
    max_duration_minutes: z
      .number()
      .int()
      .positive()
      .describe(
        "Event duration in minutes. Grant's max_duration_minutes caps this.",
      ),
    advance_notice_min_minutes: z
      .number()
      .int()
      .nonnegative()
      .describe(
        "Computed advance notice between now and start_time (minutes). Grant's advance_notice_min_minutes constrains the minimum.",
      ),
    agenda: z.string().optional().describe("Plain-text agenda."),
    calendar_id: z
      .string()
      .optional()
      .describe("Calendar id; omit for the user's primary calendar."),
  }),
  outputSchema: z.object({
    event_id: z.string(),
    calendar_link: z.string(),
    provider: z.literal("google"),
    organizer_email: z.string(),
  }),
  isConsequential: true,
  actionClass: "kinetiks_id.add_calendar_event",
  autoApproveThreshold: null,
  // D1: only offered once the customer has connected Google Calendar
  // (its own connection, revocable independently of email).
  availability: { kind: "connection_required", provider: "calendar" },
  idempotencyKeyFrom: (input: {
    title: string;
    start_time: string;
    end_time: string;
  }) => `${input.title}:${input.start_time}:${input.end_time}`,
  execute: async (input, ctx) => {
    if (!ctx.accountId) {
      throw new Error("add_calendar_event: ToolExecutionContext.accountId missing");
    }
    return await createCalendarEventViaGoogle({
      account_id: ctx.accountId,
      title: input.title,
      start_time: input.start_time,
      end_time: input.end_time,
      attendees: input.attendees,
      agenda: input.agenda,
      calendar_id: input.calendar_id,
    });
  },
});
