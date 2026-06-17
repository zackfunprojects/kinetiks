"use client";

import { useEffect, useState } from "react";
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
 * App-agnostic: the host supplies its configured Supabase browser client.
 */
export function useRealtimePresenceTransport(opts: {
  client: SupabaseClient | null;
  accountId: string | null;
  threadId: string | null;
  enabled?: boolean;
}): RealtimePresenceTransport | undefined {
  const { client, accountId, threadId, enabled = true } = opts;
  const [transport, setTransport] = useState<RealtimePresenceTransport>();

  useEffect(() => {
    if (!enabled || !client || !accountId || !threadId) {
      setTransport(undefined);
      return;
    }
    const t = createRealtimePresenceTransport({ client, accountId, threadId });
    setTransport(t);
    return () => {
      t.dispose();
      setTransport(undefined);
    };
  }, [enabled, client, accountId, threadId]);

  return transport;
}
