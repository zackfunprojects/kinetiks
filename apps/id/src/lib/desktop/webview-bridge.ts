import type { KinetiksWebviewBridge } from "@kinetiks/types";

/**
 * Accessor for the desktop webview coordination bridge (`window.electronWebview`,
 * exposed by the desktop webview preload). Absent in a browser/iframe, where the
 * embed falls back to postMessage. Merges with the `window.electron` declaration
 * in useIsDesktop.ts.
 */
declare global {
  interface Window {
    electronWebview?: KinetiksWebviewBridge;
  }
}

export function getWebviewBridge(): KinetiksWebviewBridge | null {
  const bridge = typeof window !== "undefined" ? window.electronWebview : undefined;
  // Validate the full capability, not just the flag — a partial/skewed global
  // would otherwise throw downstream when sendToHost/onHostMessage are missing.
  if (
    bridge?.isWebview === true &&
    typeof bridge.sendToHost === "function" &&
    typeof bridge.onHostMessage === "function"
  ) {
    return bridge;
  }
  return null;
}
