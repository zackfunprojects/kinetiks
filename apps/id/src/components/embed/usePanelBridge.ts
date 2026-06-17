"use client";

import { useEffect, useState } from "react";
import {
  createPostMessageBridge,
  createWebviewGuestBridge,
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
    if (webview) return createWebviewGuestBridge(webview);
    if (window.parent === window) return null; // not embedded
    return createPostMessageBridge({
      target: window.parent,
      host: window,
      origin: window.location.origin,
    });
  });

  useEffect(() => {
    return () => bridge?.dispose();
  }, [bridge]);

  return bridge;
}
