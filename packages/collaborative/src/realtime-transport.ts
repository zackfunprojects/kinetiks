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
 * SECURITY (Realtime Authorization, plan D4 + phase-8.8 D1): the channel is
 * `private: true`, so the `realtime.messages` RLS policy (migration 00091)
 * authorizes subscribe + broadcast — a foreign account cannot join
 * `presence:{account}:{thread}` even if it guessed the name. `setAuth()` (no-arg)
 * refreshes the realtime token from the browser client's current session before
 * the channel joins, so the private join carries the account JWT the policy
 * reads. The send-side `publishAccountScoped` guard remains belt-and-suspenders.
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
  let disposed = false;

  const channel: RealtimeChannel = client.channel(channelName, {
    config: { private: true, broadcast: { self: true } },
  });

  channel.on("broadcast", { event: PRESENCE_EVENT }, (message) => {
    const event = message.payload as PresenceEvent | undefined;
    if (event?.participant === "agent") {
      agentCallbacks.forEach((cb) => cb(event));
    }
  });

  // Authorize the private join, then subscribe. If the transport is disposed
  // before setAuth resolves (fast mount/unmount), skip the join so we never
  // re-add a channel that dispose() already removed.
  void Promise.resolve(client.realtime.setAuth())
    .then(() => {
      if (!disposed) channel.subscribe();
    })
    .catch((err) => onError?.(err));

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
      disposed = true;
      void Promise.resolve(client.removeChannel(channel)).catch((err) =>
        onError?.(err)
      );
    },
  };
}
