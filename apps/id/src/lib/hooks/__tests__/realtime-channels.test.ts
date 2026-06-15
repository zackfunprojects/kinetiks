import { describe, it, expect } from "vitest";
import {
  presenceChannel,
  annotationsChannel,
  workspaceChannel,
  channelAccountId,
  publishAccountScoped,
  AccountScopeError,
} from "@kinetiks/supabase";

type PublishClient = Parameters<typeof publishAccountScoped>[0];

describe("collaborative realtime channel builders", () => {
  it("builds account+thread scoped channel names", () => {
    expect(presenceChannel("acc1", "thr1")).toBe("presence:acc1:thr1");
    expect(annotationsChannel("acc1", "thr1")).toBe("annotations:acc1:thr1");
    expect(workspaceChannel("acc1", "thr1")).toBe("workspace:acc1:thr1");
  });

  it("parses the account segment, rejecting unknown prefixes and malformed names", () => {
    expect(channelAccountId("presence:acc1:thr1")).toBe("acc1");
    expect(channelAccountId("workspace:acc2:thr9")).toBe("acc2");
    // `synapse:` is a real channel but not a collaborative one — must not parse.
    expect(channelAccountId("synapse:acc1:thr1")).toBeNull();
    expect(channelAccountId("garbage")).toBeNull();
    expect(channelAccountId("presence:")).toBeNull();
    // Extra segments are malformed — must not yield a spurious owner.
    expect(channelAccountId("presence:acc1:thr1:extra")).toBeNull();
  });
});

describe("publishAccountScoped (cross-account guard, plan D4)", () => {
  it("refuses to publish on a channel the account does not own, before touching the client", async () => {
    let channelCalled = false;
    const client = {
      channel: () => {
        channelCalled = true;
        return { send: async () => {} };
      },
    } as unknown as PublishClient;

    await expect(
      publishAccountScoped(
        client,
        "attacker",
        presenceChannel("victim", "thr1"),
        "cursor",
        {}
      )
    ).rejects.toBeInstanceOf(AccountScopeError);
    expect(channelCalled).toBe(false);
  });

  it("publishes a broadcast when the account owns the channel", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const client = {
      channel: () => ({
        send: async (msg: Record<string, unknown>) => {
          sent.push(msg);
        },
      }),
    } as unknown as PublishClient;

    await publishAccountScoped(
      client,
      "acc1",
      presenceChannel("acc1", "thr1"),
      "cursor",
      { x: 1, y: 2 }
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "broadcast",
      event: "cursor",
      payload: { x: 1, y: 2 },
    });
  });
});
