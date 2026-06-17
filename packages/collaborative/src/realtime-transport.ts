import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { presenceChannel } from "@kinetiks/supabase";
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
 * SECURITY: presence is scoped by the channel name (`presence:{account}:{thread}`)
 * and this client only ever uses its own account's channel. Broadcast channels
 * have NO built-in RLS, so the channel name is not an authorization boundary on
 * its own — full Realtime Authorization (RLS on `realtime.messages`) is the 8.8
 * hardening item.
 *
 * Annotations + undo transport methods are no-ops here; they land in 8.4/8.5.
 */
export function createRealtimePresenceTransport(opts: {
  client: SupabaseClient;
  accountId: string;
  threadId: string;
  /** Reports a failed broadcast/teardown so the host can route it to Sentry. */
  onError?: (err: unknown) => void;
}): RealtimePresenceTransport {
  const { client, accountId, threadId, onError } = opts;
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

  const send = (event: PresenceEvent) => {
    void Promise.resolve(
      channel.send({ type: "broadcast", event: PRESENCE_EVENT, payload: event })
    ).catch((err) => onError?.(err));
  };

  return {
    publishUserPresence: (event) => send(event),
    publishAgentPresence: (event) => send(event),
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
      void Promise.resolve(client.removeChannel(channel)).catch((err) =>
        onError?.(err)
      );
    },
  };
}
