"use client";

import { useEffect } from "react";
import { CollaborativeProvider } from "@kinetiks/collaborative";
import { ReferenceSequenceBuilder } from "./ReferenceSequenceBuilder";

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

  const surface = (
    <ReferenceSequenceBuilder systemName={systemName} entityId={entityId} />
  );

  return (
    <CollaborativeProvider
      enabled={collaborative}
      accountId={accountId}
      threadId={threadId}
    >
      {surface}
    </CollaborativeProvider>
  );
}
