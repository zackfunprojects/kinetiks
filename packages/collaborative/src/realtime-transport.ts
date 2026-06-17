import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { presenceChannel, channelAccountId } from "@kinetiks/supabase";
import type { PresenceEvent } from "@kinetiks/types";
import type { CollaborativeTransport } from "./transport";

const PRESENCE_EVENT = "presence";

/**
 * A presence transport with an extra `publishAgentPresence` for the reference
 * fixture playback (or a future server-agent bridge), plus `dispose`.
 */
export interface RealtimePresenceTransport extends CollaborativeTransport {
  publishAgentPresence: (event: PresenceEvent) => void;
  dispose: () => void;
}

/**
 * Realtime-backed presence transport (spec §5, §12). Subscribes to and
 * publishes on a single `presence:{account}:{thread}` broadcast channel.
 *
 * Single-player (§17.5): the agent and the user are the same browser for the
 * reference surface, so `broadcast.self: true` lets the fixture-played agent
 * beats round-trip back to this client. With a real server-side agent, beats
 * arrive from the other process.
 *
 * SECURITY (plan D4): broadcast channels have no RLS — every send is guarded by
 * `channelAccountId(channel) === accountId` before it leaves, so this client
 * can never publish onto another account's presence channel.
 *
 * Annotations + undo transport methods are no-ops here; they land in 8.4/8.5.
 */
export function createRealtimePresenceTransport(opts: {
  client: SupabaseClient;
  accountId: string;
  threadId: string;
}): RealtimePresenceTransport {
  const { client, accountId, threadId } = opts;
  const channelName = presenceChannel(accountId, threadId);
  const agentCallbacks = new Set<(event: PresenceEvent) => void>();

  const channel: RealtimeChannel = client.channel(channelName, {
    config: { broadcast: { self: true } },
  });

  channel
    .on("broadcast", { event: PRESENCE_EVENT }, (message) => {
      const event = message.payload as PresenceEvent | undefined;
      if (event?.participant === "agent") {
        agentCallbacks.forEach((cb) => cb(event));
      }
    })
    .subscribe();

  // Account-scope guard before any send — broadcast has no built-in RLS.
  const guardedSend = (event: PresenceEvent) => {
    if (channelAccountId(channelName) !== accountId) return;
    void channel.send({ type: "broadcast", event: PRESENCE_EVENT, payload: event });
  };

  return {
    publishUserPresence: (event) => guardedSend(event),
    publishAgentPresence: (event) => guardedSend(event),
    onAgentPresence: (callback) => {
      agentCallbacks.add(callback);
      return () => agentCallbacks.delete(callback);
    },
    // Annotations (8.4) + undo (8.5): not wired in 8.3.
    onAnnotations: () => () => {},
    onUndoStack: () => () => {},
    persistAnnotation: async () => {},
    dismissAnnotation: async () => {},
    applyUndo: async () => {},
    delegate: async () => {},
    dispose: () => {
      void client.removeChannel(channel);
    },
  };
}
