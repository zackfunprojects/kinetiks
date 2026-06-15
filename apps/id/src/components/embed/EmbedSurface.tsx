"use client";

import { useEffect } from "react";
import { CollaborativeProvider } from "@kinetiks/collaborative";
import { Badge } from "@kinetiks/ui";

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
 * The reference collaborative surface (Phase 8.0 scaffold).
 *
 * Wraps content in CollaborativeProvider when in collaborative mode and
 * performs the postMessage handshake with the shell. The minimal-but-
 * representative editable surface (fields, step list, selectable entities)
 * lands in Phase 8.2; this slice proves the mount, auth, provider wiring, and
 * the handshake.
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
    <div style={{ padding: "var(--kt-s-6)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--kt-s-2)",
          marginBottom: "var(--kt-s-3)",
        }}
      >
        <span style={{ fontFamily: "var(--kt-font-serif)", fontSize: "var(--kt-fs-17)" }}>
          Reference workspace
        </span>
        <Badge label="fixture" variant="warning" />
      </div>
      <p style={{ fontSize: "var(--kt-fs-14)", color: "var(--kt-fg-2)", margin: 0 }}>
        {collaborative
          ? `${systemName ?? "Kinetiks"} can work here alongside you.`
          : "Standalone preview."}
      </p>
      <dl
        style={{
          marginTop: "var(--kt-s-4)",
          fontSize: "var(--kt-fs-13)",
          color: "var(--kt-fg-3)",
          display: "grid",
          gridTemplateColumns: "max-content 1fr",
          gap: "var(--kt-s-1) var(--kt-s-3)",
        }}
      >
        <dt>Entity</dt>
        <dd style={{ margin: 0, fontFamily: "var(--kt-font-mono)" }}>{entityId ?? "—"}</dd>
        <dt>Thread</dt>
        <dd style={{ margin: 0, fontFamily: "var(--kt-font-mono)" }}>{threadId ?? "—"}</dd>
      </dl>
      <p style={{ marginTop: "var(--kt-s-4)", fontSize: "var(--kt-fs-12)", color: "var(--kt-fg-3)" }}>
        The interactive surface (presence, annotations, undo) is wired in Phases 8.2–8.5.
      </p>
    </div>
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
