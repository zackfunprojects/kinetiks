import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PresenceEvent } from "@kinetiks/types";
import { createRealtimePresenceTransport } from "./realtime-transport";

type BroadcastHandler = (message: { payload?: unknown }) => void;

/**
 * Minimal SupabaseClient double capturing the channel config, the broadcast
 * handler, and the setAuth → subscribe ordering the private-channel wiring
 * depends on (Realtime Authorization, plan D1).
 */
function makeClient(opts?: { setAuth?: () => Promise<void> }) {
  let broadcastHandler: BroadcastHandler | undefined;
  const subscribe = vi.fn();
  const send = vi.fn().mockResolvedValue(undefined);
  const on = vi.fn(
    (_type: string, _filter: unknown, handler: BroadcastHandler) => {
      broadcastHandler = handler;
      return channel;
    }
  );
  const channel = { on, subscribe, send };
  const channelFactory = vi.fn((_name: string, _options?: unknown) => channel);
  const setAuth = vi.fn(opts?.setAuth ?? (() => Promise.resolve()));
  const removeChannel = vi.fn().mockResolvedValue(undefined);

  const client = {
    channel: channelFactory,
    removeChannel,
    realtime: { setAuth },
  } as unknown as SupabaseClient;

  return {
    client,
    channelFactory,
    channel,
    subscribe,
    send,
    setAuth,
    removeChannel,
    emit: (msg: { payload?: unknown }) => broadcastHandler?.(msg),
  };
}

const presence = (participant: "agent" | "user"): PresenceEvent => ({
  participant,
  event_type: "focus",
  target: { component_id: "subject" },
  timestamp: "2026-06-17T00:00:00.000Z",
});

describe("createRealtimePresenceTransport — Realtime Authorization wiring", () => {
  it("creates a PRIVATE channel with broadcast self-delivery", () => {
    const h = makeClient();
    createRealtimePresenceTransport({ client: h.client, accountId: "acc", threadId: "thr" });

    expect(h.channelFactory).toHaveBeenCalledTimes(1);
    const [name, options] = h.channelFactory.mock.calls[0];
    expect(name).toBe("presence:acc:thr");
    expect(options).toEqual({ config: { private: true, broadcast: { self: true } } });
  });

  it("calls setAuth() before subscribing (private join carries the JWT)", async () => {
    const h = makeClient();
    createRealtimePresenceTransport({ client: h.client, accountId: "acc", threadId: "thr" });

    expect(h.setAuth).toHaveBeenCalledTimes(1);
    // subscribe is deferred until setAuth resolves.
    expect(h.subscribe).not.toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.subscribe).toHaveBeenCalledTimes(1);
  });

  it("does NOT subscribe if disposed before setAuth resolves", async () => {
    let resolveAuth!: () => void;
    const gated = new Promise<void>((r) => {
      resolveAuth = r;
    });
    const h = makeClient({ setAuth: () => gated });
    const t = createRealtimePresenceTransport({
      client: h.client,
      accountId: "acc",
      threadId: "thr",
    });

    t.dispose();
    resolveAuth();
    await Promise.resolve();
    await Promise.resolve();

    expect(h.subscribe).not.toHaveBeenCalled();
    expect(h.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("publishes user + agent presence as broadcast sends", () => {
    const h = makeClient();
    const t = createRealtimePresenceTransport({ client: h.client, accountId: "acc", threadId: "thr" });

    t.publishUserPresence(presence("user"));
    t.publishAgentPresence(presence("agent"));

    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send.mock.calls[0][0]).toMatchObject({
      type: "broadcast",
      event: "presence",
      payload: { participant: "user" },
    });
  });

  it("only forwards agent beats to onAgentPresence subscribers", () => {
    const h = makeClient();
    const t = createRealtimePresenceTransport({ client: h.client, accountId: "acc", threadId: "thr" });
    const seen: PresenceEvent[] = [];
    t.onAgentPresence((e) => seen.push(e));

    h.emit({ payload: presence("user") });
    h.emit({ payload: presence("agent") });

    expect(seen).toHaveLength(1);
    expect(seen[0].participant).toBe("agent");
  });
});
