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

const { dispatchMock, engineMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  engineMock: vi.fn(),
}));
vi.mock("@kinetiks/ai/slack-dispatcher", () => ({
  dispatchSlackMessage: dispatchMock,
}));
vi.mock("@/lib/marcus/engine", () => ({
  processMarcusMessage: engineMock,
}));

import { captureException } from "@/lib/observability/sentry";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  processSlackEvent,
  stripBotMention,
  type SlackInboundEvent,
} from "../inbound";

const mockCreateAdmin = vi.mocked(createAdminClient);
const mockCapture = vi.mocked(captureException);

interface AdminStubOptions {
  accountForTeam?: string | null;
  claimDuplicate?: boolean;
  existingThreadId?: string | null;
}

function stubAdmin(options: AdminStubOptions = {}) {
  const claims: Array<Record<string, unknown>> = [];
  const threadsInserted: Array<Record<string, unknown>> = [];
  const from = vi.fn((table: string) => {
    if (table === "kinetiks_connections") {
      const maybeSingle = vi.fn(async () => ({
        data:
          options.accountForTeam === null
            ? null
            : { account_id: options.accountForTeam ?? "acc-1", status: "active" },
        error: null,
      }));
      const limit = vi.fn(() => ({ maybeSingle }));
      const order = vi.fn(() => ({ limit }));
      const filter = vi.fn(() => ({ order }));
      const eqStatus = vi.fn(() => ({ filter }));
      const eqProvider = vi.fn(() => ({ eq: eqStatus }));
      return { select: vi.fn(() => ({ eq: eqProvider })) };
    }
    if (table === "kinetiks_inbound_events") {
      return {
        insert: vi.fn((row: Record<string, unknown>) => {
          claims.push(row);
          return Promise.resolve({
            error: options.claimDuplicate
              ? { code: "23505", message: "duplicate key" }
              : null,
          });
        }),
      };
    }
    // kinetiks_marcus_threads
    const maybeSingleLookup = vi.fn(async () => ({
      data: options.existingThreadId ? { id: options.existingThreadId } : null,
      error: null,
    }));
    const eq3 = vi.fn(() => ({ maybeSingle: maybeSingleLookup }));
    const eq2 = vi.fn(() => ({ eq: eq3 }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    return {
      select: vi.fn(() => ({ eq: eq1 })),
      insert: vi.fn((row: Record<string, unknown>) => {
        threadsInserted.push(row);
        return {
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { id: "thread-new" },
              error: null,
            })),
          })),
        };
      }),
    };
  });
  mockCreateAdmin.mockReturnValue({ from } as never);
  return { claims, threadsInserted };
}

const MENTION: SlackInboundEvent = {
  type: "app_mention",
  user: "U0HUMAN",
  text: "<@U0BOT> how is pipeline?",
  channel: "C0GTM",
  ts: "1781300000.000100",
};

beforeEach(() => {
  vi.clearAllMocks();
  engineMock.mockResolvedValue({
    thread_id: "thread-new",
    message: "Pipeline is steady - 14 active deals.",
  });
  dispatchMock.mockResolvedValue({ ts: "1781300001.000200", channel: "C0GTM" });
});

describe("stripBotMention", () => {
  it("strips the leading mention", () => {
    expect(stripBotMention("<@U0BOT> how is pipeline?")).toBe("how is pipeline?");
  });
  it("strips embedded mentions when the message is only a mention plus text", () => {
    expect(stripBotMention("<@U0BOT>")).toBe("");
    expect(stripBotMention("hey <@U0BOT> ping")).toBe("hey <@U0BOT> ping".replace(/^\s*<@[A-Z0-9]+>\s*/i, "").trim());
  });
});

describe("processSlackEvent", () => {
  it("answers a mention with a threaded Marcus reply on a synced thread", async () => {
    const { claims, threadsInserted } = stubAdmin();

    const outcome = await processSlackEvent({
      teamId: "T0TEAM",
      eventId: "Ev0001",
      event: MENTION,
    });

    expect(outcome).toBe("replied");
    // Claimed exactly-once under the team-scoped key.
    expect(claims[0]).toMatchObject({
      account_id: "acc-1",
      source: "slack",
      event_key: "T0TEAM:Ev0001",
      event_type: "app_mention",
    });
    // Thread synced with slack coordinates, rooted at the message ts.
    expect(threadsInserted[0]).toMatchObject({
      account_id: "acc-1",
      channel: "slack",
      slack_channel_id: "C0GTM",
      slack_thread_ts: "1781300000.000100",
    });
    // Engine ran with the synced thread + slack channel; mention stripped.
    expect(engineMock).toHaveBeenCalledWith(
      expect.anything(),
      "acc-1",
      "how is pipeline?",
      "thread-new",
      "slack",
    );
    // Reply went back in-thread through the named-identity dispatcher.
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: "acc-1",
        channel: "C0GTM",
        thread_ts: "1781300000.000100",
        body: "Pipeline is steady - 14 active deals.",
      }),
    );
  });

  it("continues an existing thread for a threaded reply", async () => {
    stubAdmin({ existingThreadId: "thread-existing" });

    await processSlackEvent({
      teamId: "T0TEAM",
      eventId: "Ev0002",
      event: { ...MENTION, thread_ts: "1781290000.000001" },
    });

    expect(engineMock).toHaveBeenCalledWith(
      expect.anything(),
      "acc-1",
      "how is pipeline?",
      "thread-existing",
      "slack",
    );
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ thread_ts: "1781290000.000001" }),
    );
  });

  it("handles DMs without mention-stripping", async () => {
    stubAdmin();
    await processSlackEvent({
      teamId: "T0TEAM",
      eventId: "Ev0003",
      event: {
        type: "message",
        channel_type: "im",
        user: "U0HUMAN",
        text: "what changed this week?",
        channel: "D0DM",
        ts: "1781300002.000300",
      },
    });
    expect(engineMock).toHaveBeenCalledWith(
      expect.anything(),
      "acc-1",
      "what changed this week?",
      "thread-new",
      "slack",
    );
  });

  it("skips duplicate deliveries via the claim table", async () => {
    stubAdmin({ claimDuplicate: true });
    const outcome = await processSlackEvent({
      teamId: "T0TEAM",
      eventId: "Ev0001",
      event: MENTION,
    });
    expect(outcome).toBe("duplicate");
    expect(engineMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("ignores bot messages, subtypes, and channel chatter", async () => {
    stubAdmin();
    expect(
      await processSlackEvent({
        teamId: "T0TEAM",
        eventId: "Ev0004",
        event: { ...MENTION, bot_id: "B0BOT" },
      }),
    ).toBe("ignored");
    expect(
      await processSlackEvent({
        teamId: "T0TEAM",
        eventId: "Ev0005",
        event: { type: "message", subtype: "message_changed", channel: "C0GTM", ts: "1.2", user: "U0HUMAN" },
      }),
    ).toBe("ignored");
    expect(
      await processSlackEvent({
        teamId: "T0TEAM",
        eventId: "Ev0006",
        event: { type: "message", channel_type: "channel", channel: "C0GTM", ts: "1.2", user: "U0HUMAN", text: "regular chatter" },
      }),
    ).toBe("ignored");
    expect(engineMock).not.toHaveBeenCalled();
  });

  it("maps an unclaimed workspace to no_account", async () => {
    stubAdmin({ accountForTeam: null });
    expect(
      await processSlackEvent({ teamId: "T0OTHER", eventId: "Ev0007", event: MENTION }),
    ).toBe("no_account");
  });

  it("never throws: engine failures are captured and reported as failed", async () => {
    stubAdmin();
    engineMock.mockRejectedValueOnce(new Error("engine exploded"));
    const outcome = await processSlackEvent({
      teamId: "T0TEAM",
      eventId: "Ev0008",
      event: MENTION,
    });
    expect(outcome).toBe("failed");
    expect(mockCapture).toHaveBeenCalled();
  });
});
