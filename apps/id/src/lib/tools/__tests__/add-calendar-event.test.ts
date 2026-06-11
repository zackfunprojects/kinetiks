import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createCalendarEventViaGoogleMock } = vi.hoisted(() => ({
  createCalendarEventViaGoogleMock: vi.fn(),
}));

vi.mock("@/lib/calendar/create-via-google", () => ({
  createCalendarEventViaGoogle: createCalendarEventViaGoogleMock,
}));

import { ToolError } from "@kinetiks/tools";

import { addCalendarEventTool } from "../add-calendar-event";

beforeEach(() => {
  createCalendarEventViaGoogleMock.mockReset();
});

afterEach(() => {
  createCalendarEventViaGoogleMock.mockReset();
});

const ctx = {
  accountId: "11111111-1111-1111-1111-111111111111",
  userId: "22222222-2222-2222-2222-222222222222",
  teamScopeId: null,
  invokedByAgent: "marcus",
  correlationId: null,
  threadId: null,
  agentRunId: "run_test",
  parentAiCallId: null,
  proposalId: null,
  approvalId: null,
  grantId: null,
  patternId: null,
  metadata: {},
  signal: undefined,
};

describe("add_calendar_event tool", () => {
  it("declares the action class and is consequential", () => {
    expect(addCalendarEventTool.actionClass).toBe(
      "kinetiks_id.add_calendar_event",
    );
    expect(addCalendarEventTool.isConsequential).toBe(true);
    expect(addCalendarEventTool.autoApproveThreshold).toBeNull();
  });

  it("requires the calendar system connection (D1)", () => {
    expect(addCalendarEventTool.availability).toEqual({
      kind: "connection_required",
      provider: "calendar",
    });
  });

  it("derives an idempotency key from title + start/end times", () => {
    const key = addCalendarEventTool.idempotencyKeyFrom?.({
      title: "Acme onboarding sync",
      start_time: "2026-06-01T15:00:00Z",
      end_time: "2026-06-01T15:30:00Z",
      max_attendees: 10,
      max_duration_minutes: 60,
      advance_notice_min_minutes: 60,
    });
    expect(key).toBe("Acme onboarding sync:2026-06-01T15:00:00Z:2026-06-01T15:30:00Z");
  });

  it("calls the dispatcher with normalized arguments and returns its result", async () => {
    createCalendarEventViaGoogleMock.mockResolvedValueOnce({
      event_id: "evt_abc",
      calendar_link: "https://calendar.google.com/event?eid=abc",
      provider: "google",
      organizer_email: "founder@acme.com",
    });

    const result = await addCalendarEventTool.execute(
      {
        title: "Acme onboarding sync",
        start_time: "2026-06-01T15:00:00Z",
        end_time: "2026-06-01T15:30:00Z",
        attendees: ["acme@example.com"],
        max_attendees: 10,
        max_duration_minutes: 60,
        advance_notice_min_minutes: 60,
      },
      ctx,
    );

    expect(result).toEqual({
      event_id: "evt_abc",
      calendar_link: "https://calendar.google.com/event?eid=abc",
      provider: "google",
      organizer_email: "founder@acme.com",
    });
    expect(createCalendarEventViaGoogleMock).toHaveBeenCalledWith({
      account_id: ctx.accountId,
      title: "Acme onboarding sync",
      start_time: "2026-06-01T15:00:00Z",
      end_time: "2026-06-01T15:30:00Z",
      attendees: ["acme@example.com"],
      agenda: undefined,
      calendar_id: undefined,
    });
  });

  it("throws when accountId is missing on the execution context", async () => {
    await expect(
      addCalendarEventTool.execute(
        {
          title: "x",
          start_time: "2026-06-01T15:00:00Z",
          end_time: "2026-06-01T15:30:00Z",
          max_attendees: 0,
          max_duration_minutes: 30,
          advance_notice_min_minutes: 0,
        },
        { ...ctx, accountId: null as unknown as string },
      ),
    ).rejects.toThrow(/accountId missing/);
  });

  it("propagates a dispatcher ToolError unchanged", async () => {
    createCalendarEventViaGoogleMock.mockRejectedValueOnce(
      new ToolError("unavailable", "Google Workspace is not connected", {
        context: { tool: "add_calendar_event", account_id: ctx.accountId },
      }),
    );
    await expect(
      addCalendarEventTool.execute(
        {
          title: "x",
          start_time: "2026-06-01T15:00:00Z",
          end_time: "2026-06-01T15:30:00Z",
          max_attendees: 0,
          max_duration_minutes: 30,
          advance_notice_min_minutes: 0,
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(ToolError);
  });
});
