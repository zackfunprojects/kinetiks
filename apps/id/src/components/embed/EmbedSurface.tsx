"use client";

import { useEffect, useMemo } from "react";
import {
  CollaborativeProvider,
  useRealtimePresenceTransport,
} from "@kinetiks/collaborative";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { PresenceSurface } from "./PresenceSurface";

export interface EmbedSurfaceProps {
  accountId: string;
  systemName: string | null;
  threadId: string | null;
  entityId: string | null;
  collaborative: boolean;
}

/**
 * Same-origin embed postMessage contract (parent shell <-> embed surface).
 * Both sides check `event.origin === window.location.origin` (same-origin)
 * and the `source: "kinetiks-embed"` tag before trusting a message.
 */
const EMBED_SOURCE = "kinetiks-embed" as const;

/**
 * The reference collaborative surface.
 *
 * Wraps the minimal-but-representative ReferenceSequenceBuilder in
 * CollaborativeProvider when in collaborative mode and performs the same-origin
 * postMessage handshake with the shell. Presence (8.3) and annotations (8.4)
 * anchor to the builder's `data-component-id` / `data-field-name` elements.
 */
export function EmbedSurface({
  accountId,
  systemName,
  threadId,
  entityId,
  collaborative,
}: EmbedSurfaceProps) {
  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;

    // Announce readiness to the shell.
    window.parent.postMessage(
      { source: EMBED_SOURCE, type: "ready", entity: entityId, thread: threadId },
      window.location.origin
    );

    // Listen for shell -> embed messages (init, focus, delegate) — same-origin only.
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { source?: string; type?: string } | null;
      if (!data || data.source !== EMBED_SOURCE) return;
      // Phase 8.2+ handles init/focus/delegate; the channel exists from here.
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [entityId, threadId]);

  // The browser client authenticates via the shared session cookie. The
  // transport is null until mounted / outside collaborative mode.
  const client = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const transport = useRealtimePresenceTransport({
    client,
    accountId,
    threadId,
    enabled: collaborative,
  });

  return (
    <CollaborativeProvider
      enabled={collaborative}
      accountId={accountId}
      threadId={threadId}
      transport={transport}
    >
      <PresenceSurface
        systemName={systemName}
        entityId={entityId}
        collaborative={collaborative}
        transport={transport}
      />
    </CollaborativeProvider>
  );
}
