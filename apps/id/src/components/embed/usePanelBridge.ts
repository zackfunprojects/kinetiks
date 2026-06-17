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
  // Created once per mount (lazy initializer); disposed on unmount.
  const [bridge] = useState<PanelBridge | null>(() => {
    if (typeof window === "undefined") return null;
    const webview = getWebviewBridge();
    const kind = guestBridgeKind(webview !== null, window.parent !== window);
    if (kind === "webview" && webview) return createWebviewGuestBridge(webview);
    if (kind === "postmessage") {
      return createPostMessageBridge({
        target: window.parent,
        host: window,
        origin: window.location.origin,
      });
    }
    return null;
  });

  useEffect(() => {
    return () => bridge?.dispose();
  }, [bridge]);

  return bridge;
}
