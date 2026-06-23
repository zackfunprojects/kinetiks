"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createRealtimePresenceTransport,
  type RealtimePresenceTransport,
} from "./realtime-transport";

/**
 * Creates a Realtime presence transport for the given session and tears it down
 * on unmount or scope change. Returns undefined until mounted (the provider
 * runs local-only until the transport is ready) and outside collaborative mode.
 *
 * App-agnostic: the host supplies its configured Supabase browser client AND an
 * `onError` reporter. The transport routes a failed `setAuth()`/private-channel
 * join (Realtime Authorization, migration 00091) plus any failed broadcast/
 * teardown to `onError` — the host wires it to its Sentry helper so an
 * authorization-join failure is observable, never a silently dead subscription.
 */
export function useRealtimePresenceTransport(opts: {
  client: SupabaseClient | null;
  accountId: string | null;
  threadId: string | null;
  enabled?: boolean;
  onError?: (err: unknown) => void;
}): RealtimePresenceTransport | undefined {
  const { client, accountId, threadId, enabled = true, onError } = opts;
  const [transport, setTransport] = useState<RealtimePresenceTransport>();

  // Route onError through a ref so a changing callback identity does not tear
  // down and rebuild the channel.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled || !client || !accountId || !threadId) {
      setTransport(undefined);
      return;
    }
    const t = createRealtimePresenceTransport({
      client,
      accountId,
      threadId,
      onError: (err) => onErrorRef.current?.(err),
    });
    setTransport(t);
    return () => {
      t.dispose();
      setTransport(undefined);
    };
  }, [enabled, client, accountId, threadId]);

  return transport;
}
