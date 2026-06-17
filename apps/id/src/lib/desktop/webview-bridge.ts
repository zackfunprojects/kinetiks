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
  if (typeof window !== "undefined" && window.electronWebview?.isWebview) {
    return window.electronWebview;
  }
  return null;
}
