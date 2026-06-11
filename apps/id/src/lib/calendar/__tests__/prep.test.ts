import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/observability/sentry", () => ({
  captureException: vi.fn(async () => undefined),
}));
vi.mock("@kinetiks/lib/env", () => ({
  serverEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://id.kinetiks.test" }),
}));
vi.mock("@/lib/marcus/context-assembly", () => ({
  assembleContext: vi.fn(async () => "B2B SaaS, ICP: heads of growth."),
}));

const {
  askClaudeMock,
  listEventsMock,
  sendEmailMock,
  ownerEmailMock,
  slackDmMock,
  alertMock,
} = vi.hoisted(() => ({
  askClaudeMock: vi.fn(),
  listEventsMock: vi.fn(),
  sendEmailMock: vi.fn(),
  ownerEmailMock: vi.fn(),
  slackDmMock: vi.fn(),
  alertMock: vi.fn(),
}));
vi.mock("@kinetiks/ai", () => ({ askClaude: askClaudeMock }));
vi.mock("@/lib/calendar/events", () => ({ listUpcomingEvents: listEventsMock }));
vi.mock("@/lib/email/sender", () => ({
  sendSystemEmail: sendEmailMock,
  resolveOwnerEmail: ownerEmailMock,
}));
vi.mock("@/lib/comms/proactive-delivery", () => ({
  deliverSlackDm: slackDmMock,
  createInAppAlert: alertMock,
}));

import { ToolError } from "@kinetiks/tools";

import { createAdminClient } from "@/lib/supabase/admin";
import { truncateContextSummary } from "@/lib/ai/prompts/meeting-prep";
import { runMeetingPrep } from "../prep";

const mockCreateAdmin = vi.mocked(createAdminClient);

function stubAdmin(options: { claimDuplicate?: boolean } = {}) {
  const claims: Array<Record<string, unknown>> = [];
  const from = vi.fn((table: string) => {
    if (table === "kinetiks_inbound_events") {
      return {
        insert: vi.fn((row: Record<string, unknown>) => {
          claims.push(row);
          return Promise.resolve({
            error: options.claimDuplicate
              ? { code: "23505", message: "duplicate" }
              : null,
          });
        }),
      };
    }
    if (table === "kinetiks_marcus_schedules") {
      const maybeSingle = vi.fn(async () => ({
        data: { timezone: "America/New_York" },
        error: null,
      }));
      const limit = vi.fn(() => ({ maybeSingle }));
      const eq = vi.fn(() => ({ limit }));
      return { select: vi.fn(() => ({ eq })) };
    }
    // kinetiks_accounts
    const maybeSingle = vi.fn(async () => ({
      data: { system_name: "Kit" },
      error: null,
    }));
    const eq = vi.fn(() => ({ maybeSingle }));
    return { select: vi.fn(() => ({ eq })) };
  });
  mockCreateAdmin.mockReturnValue({ from } as never);
  return { claims };
}

const EVENT = {
  id: "ev-1",
  title: "Acme technical deep-dive",
  start: "2026-06-11T15:30:00Z",
  end: "2026-06-11T16:00:00Z",
  attendee_names: ["Jane Doe", "Sam Lee"],
  conference_link: "https://meet.test/abc",
  organizer_self: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  listEventsMock.mockResolvedValue([EVENT]);
  askClaudeMock.mockResolvedValue("Acme cares about compliance. Lead with the SOC 2 story.");
  ownerEmailMock.mockResolvedValue("owner@acme.test");
  sendEmailMock.mockResolvedValue({ provider: "gmail", message_id: "m1" });
  slackDmMock.mockResolvedValue("sent");
  alertMock.mockResolvedValue("alert-1");
});

describe("runMeetingPrep", () => {
  it("preps the window's meetings and delivers through every leg", async () => {
    const { claims } = stubAdmin();

    const result = await runMeetingPrep("acc-1");

    expect(result).toMatchObject({
      status: "ran",
      events_in_window: 1,
      briefs_sent: 1,
      duplicates: 0,
      failures: 0,
    });
    // The window is 25-40 minutes out.
    const args = listEventsMock.mock.calls[0]![0] as { from: Date; to: Date };
    const spanMinutes = (args.to.getTime() - args.from.getTime()) / 60_000;
    expect(spanMinutes).toBe(15);
    // Claimed per (event, start) so reschedules re-prep.
    expect(claims[0]).toMatchObject({
      source: "calendar",
      event_key: `gcal_prep:acc-1:ev-1:${EVENT.start}`,
    });
    // Prompt carries names only - the events reader already stripped addresses.
    const prompt = String(askClaudeMock.mock.calls[0]![0]);
    expect(prompt).toContain("Jane Doe, Sam Lee");
    expect(prompt).toContain("Acme technical deep-dive");
    // All three legs delivered.
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "summary", to: ["owner@acme.test"] }),
    );
    expect(slackDmMock).toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        delivered_via: ["in_app", "email", "slack"],
      }),
    );
  });

  it("skips delivery for already-prepped events via the claim (CR: claim gates sends, not generation)", async () => {
    stubAdmin({ claimDuplicate: true });
    const result = await runMeetingPrep("acc-1");
    expect(result.duplicates).toBe(1);
    expect(result.briefs_sent).toBe(0);
    // Generation may run (worst case: one duplicate Haiku call), but
    // nothing external sends on a duplicate claim.
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(slackDmMock).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
  });

  it("leaves no claim when generation fails, so the next cycle retries (CR)", async () => {
    const { claims } = stubAdmin();
    askClaudeMock.mockRejectedValueOnce(new Error("model unavailable"));
    const result = await runMeetingPrep("acc-1");
    expect(result.failures).toBe(1);
    expect(claims).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("formats the meeting time in the customer's schedule timezone (CR)", async () => {
    stubAdmin();
    await runMeetingPrep("acc-1");
    // 15:30Z in America/New_York (June, EDT) = 11:30 AM.
    const alertArgs = alertMock.mock.calls[0]![0] as { title: string };
    expect(alertArgs.title).toContain("11:30");
    expect(alertArgs.title).not.toContain("15:30");
  });

  it("keeps the in-app floor when email and slack legs fail", async () => {
    stubAdmin();
    sendEmailMock.mockRejectedValueOnce(new ToolError("rate_limited", "cap", { context: {} }));
    slackDmMock.mockRejectedValueOnce(new Error("workspace gone"));

    const result = await runMeetingPrep("acc-1");

    expect(result.briefs_sent).toBe(1);
    expect(alertMock).toHaveBeenCalledWith(
      expect.objectContaining({ delivered_via: ["in_app"] }),
    );
  });

  it("reports no_connection when the calendar connection is missing", async () => {
    stubAdmin();
    listEventsMock.mockRejectedValueOnce(
      new ToolError("unavailable", "not connected", { context: {} }),
    );
    const result = await runMeetingPrep("acc-1");
    expect(result.status).toBe("no_connection");
  });

  it("returns early with zero work when the window is empty", async () => {
    stubAdmin();
    listEventsMock.mockResolvedValueOnce([]);
    const result = await runMeetingPrep("acc-1");
    expect(result.events_in_window).toBe(0);
    expect(askClaudeMock).not.toHaveBeenCalled();
  });
});

describe("truncateContextSummary", () => {
  it("returns short summaries untouched and cuts long ones on a sentence boundary", () => {
    expect(truncateContextSummary("Short.")).toBe("Short.");
    const sentence = "This is a sentence about the funnel. ";
    const long = sentence.repeat(200);
    const cut = truncateContextSummary(long, 400);
    expect(cut.length).toBeLessThanOrEqual(400);
    expect(cut.endsWith(".")).toBe(true);
  });

  it("falls back to a word boundary when no sentence end is in range", () => {
    const noSentences = ("word ").repeat(300).trim();
    const cut = truncateContextSummary(noSentences, 100);
    expect(cut.length).toBeLessThanOrEqual(100);
    expect(cut.endsWith("word")).toBe(true);
  });
});
