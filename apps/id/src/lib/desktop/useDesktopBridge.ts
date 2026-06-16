"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { DesktopMenuAction } from "@kinetiks/types";
import { getDesktopBridge } from "./useIsDesktop";

export interface DesktopBridgeHandlers {
  onPalette?: () => void;
  onSettings?: () => void;
  onApprovals?: () => void;
  onNewThread?: () => void;
}

/**
 * Wires the desktop shell's IPC into shell actions:
 *  - `onDeepLink(path)` -> client-side navigation (kinetiks:// links, notification
 *    clicks resolved by the main process to an in-app path)
 *  - `onMenuAction(action)` -> tab navigation (Cmd+1/2/3) + the palette / settings /
 *    approvals / new-thread handlers the shell provides (spec-addendum-chat-ux §B.4)
 *
 * No-op outside the desktop shell. Handlers ride a ref so changing their
 * identity each render doesn't tear down the subscriptions.
 */
export function useDesktopBridge(handlers: DesktopBridgeHandlers): void {
  const router = useRouter();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;

    const unsubDeepLink = bridge.onDeepLink((path) => router.push(path));

    const unsubMenu = bridge.onMenuAction((action: DesktopMenuAction) => {
      const h = handlersRef.current;
      switch (action) {
        case "tab:chat":
          router.push("/chat");
          break;
        case "tab:analytics":
          router.push("/analytics");
          break;
        case "tab:cortex":
          router.push("/cortex");
          break;
        case "new-thread":
          if (h.onNewThread) h.onNewThread();
          else router.push("/chat");
          break;
        case "approvals":
          if (h.onApprovals) h.onApprovals();
          else router.push("/chat");
          break;
        case "palette":
          h.onPalette?.();
          break;
        case "settings":
          h.onSettings?.();
          break;
      }
    });

    return () => {
      unsubDeepLink();
      unsubMenu();
    };
  }, [router]);
}
