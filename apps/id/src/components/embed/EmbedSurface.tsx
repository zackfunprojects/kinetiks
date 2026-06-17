"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CollaborativeProvider,
  useRealtimePresenceTransport,
} from "@kinetiks/collaborative";
import { ToastProvider } from "@kinetiks/ui";
import { PANEL_MESSAGE_SOURCE } from "@kinetiks/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { PresenceSurface } from "./PresenceSurface";
import { usePanelBridge } from "./usePanelBridge";

export interface EmbedSurfaceProps {
  accountId: string;
  systemName: string | null;
  threadId: string | null;
  entityId: string | null;
  collaborative: boolean;
}

/**
 * The reference collaborative surface.
 *
 * Wraps the minimal-but-representative ReferenceSequenceBuilder in
 * CollaborativeProvider when in collaborative mode. The shell↔embed coordination
 * handshake runs over `usePanelBridge` — postMessage in a web iframe, webview
 * IPC in the desktop shell (Phase 8.7) — so the same surface works on both.
 * Presence/annotations anchor to the builder's `data-component-id` elements.
 */
export function EmbedSurface({
  accountId,
  systemName,
  threadId,
  entityId,
  collaborative,
}: EmbedSurfaceProps) {
  const bridge = usePanelBridge();
  // The host marks a cached-but-hidden frame suspended (§14.3) — pause the
  // agent playback so off-screen webviews don't run live presence.
  const [suspended, setSuspended] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    // Announce readiness to the shell.
    bridge.post({ source: PANEL_MESSAGE_SOURCE, type: "ready", entity_id: entityId, thread_id: threadId });
    // Visibility is the only coordination the surface root reacts to; the
    // presence layer subscribes for focus/delegate.
    const off = bridge.subscribe((msg) => {
      if (msg.type === "visibility") setSuspended(!msg.visible);
    });
    return off;
  }, [bridge, entityId, threadId]);

  // The browser client authenticates via the shared session cookie (mirrored
  // into the collaborative partition on desktop). The transport is null until
  // mounted / outside collaborative mode.
  const client = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const transport = useRealtimePresenceTransport({
    client,
    accountId,
    threadId,
    enabled: collaborative,
  });

  return (
    <ToastProvider>
      <CollaborativeProvider
        enabled={collaborative}
        accountId={accountId}
        threadId={threadId}
        transport={transport}
      >
        <PresenceSurface
          systemName={systemName}
          entityId={entityId}
          accountId={accountId}
          threadId={threadId}
          collaborative={collaborative}
          transport={transport}
          bridge={bridge}
          suspended={suspended}
        />
      </CollaborativeProvider>
    </ToastProvider>
  );
}
