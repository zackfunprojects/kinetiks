import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRealtimePresenceTransport } from "@kinetiks/collaborative";
import type { PresenceEvent } from "@kinetiks/types";

type BroadcastMsg = { payload: PresenceEvent };

/** Minimal Supabase client mock: records the channel name + sent messages and
 *  lets the test deliver inbound broadcasts to the registered handler. */
function makeMockClient() {
  let channelName = "";
  let broadcastHandler: ((msg: BroadcastMsg) => void) | null = null;
  const sent: Array<{ type: string; event: string; payload: PresenceEvent }> = [];

  const channel = {
    on: (type: string, _filter: unknown, handler: (msg: BroadcastMsg) => void) => {
      if (type === "broadcast") broadcastHandler = handler;
      return channel;
    },
    subscribe: () => channel,
    send: async (msg: { type: string; event: string; payload: PresenceEvent }) => {
      sent.push(msg);
    },
  };

  const client = {
    channel: (name: string) => {
      channelName = name;
      return channel;
    },
    removeChannel: () => {},
    // Private collaborative channels authorize the join via setAuth() before
    // subscribe (Realtime Authorization, migration 00091).
    realtime: { setAuth: async () => {} },
  };

  return {
    client: client as unknown as SupabaseClient,
    sent,
    getChannelName: () => channelName,
    deliver: (payload: PresenceEvent) => broadcastHandler?.({ payload }),
  };
}

const agentBeat: PresenceEvent = {
  participant: "agent",
  event_type: "uncertain",
  target: { component_id: "sequence", field_name: "tone" },
  timestamp: "2026-01-01T00:00:00.000Z",
};

const userBeat: PresenceEvent = {
  participant: "user",
  event_type: "focus",
  target: { component_id: "sequence", field_name: "topic" },
  timestamp: "2026-01-01T00:00:00.000Z",
};

describe("createRealtimePresenceTransport", () => {
  it("subscribes to the account+thread-scoped presence channel", () => {
    const mock = makeMockClient();
    createRealtimePresenceTransport({ client: mock.client, accountId: "acc1", threadId: "thr1" });
    expect(mock.getChannelName()).toBe("presence:acc1:thr1");
  });

  it("publishes user + agent presence as broadcast on the scoped channel", () => {
    const mock = makeMockClient();
    const t = createRealtimePresenceTransport({ client: mock.client, accountId: "acc1", threadId: "thr1" });
    t.publishUserPresence(userBeat);
    t.publishAgentPresence(agentBeat);
    expect(mock.sent).toHaveLength(2);
    expect(mock.sent[0]).toMatchObject({ type: "broadcast", event: "presence", payload: userBeat });
    expect(mock.sent[1]).toMatchObject({ type: "broadcast", event: "presence", payload: agentBeat });
  });

  it("delivers agent beats to onAgentPresence and filters out user beats", () => {
    const mock = makeMockClient();
    const t = createRealtimePresenceTransport({ client: mock.client, accountId: "acc1", threadId: "thr1" });
    const received: PresenceEvent[] = [];
    t.onAgentPresence((e) => received.push(e));

    mock.deliver(agentBeat);
    mock.deliver(userBeat); // not an agent beat — must be ignored

    expect(received).toEqual([agentBeat]);
  });

  it("stops delivering after unsubscribe", () => {
    const mock = makeMockClient();
    const t = createRealtimePresenceTransport({ client: mock.client, accountId: "acc1", threadId: "thr1" });
    const received: PresenceEvent[] = [];
    const unsub = t.onAgentPresence((e) => received.push(e));
    unsub();
    mock.deliver(agentBeat);
    expect(received).toEqual([]);
  });
});
