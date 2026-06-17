"use client";

import { useEffect, useState } from "react";
import {
  createPostMessageBridge,
  createWebviewGuestBridge,
  guestBridgeKind,
  type PanelBridge,
} from "@kinetiks/collaborative";
import { getWebviewBridge } from "@/lib/desktop/webview-bridge";

/**
 * The embed (guest) side of the shell↔embed coordination bridge (Phase 8.7,
 * task 3). Picks the desktop webview IPC bridge when hosted in a `<webview>`,
 * else the parent↔iframe postMessage bridge. Null when not embedded (standalone
 * `/embed`). The same EmbedSurface uses this on web and desktop unchanged.
 */
export function usePanelBridge(): PanelBridge | null {
  // Constructed in an effect (not the render-phase useState initializer) so the
  // bridge's listeners are never registered during render — disposed on unmount.
  const [bridge, setBridge] = useState<PanelBridge | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const webview = getWebviewBridge();
    const kind = guestBridgeKind(webview !== null, window.parent !== window);
    const next =
      kind === "webview" && webview
        ? createWebviewGuestBridge(webview)
        : kind === "postmessage"
          ? createPostMessageBridge({
              target: window.parent,
              host: window,
              origin: window.location.origin,
              // Only trust messages from the shell (our parent window).
              expectedSource: () => window.parent,
            })
          : null;
    setBridge(next);
    return () => next?.dispose();
  }, []);

  return bridge;
}
