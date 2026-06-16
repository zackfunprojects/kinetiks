/**
 * Contract for the bridge the Electron desktop shell exposes to the
 * renderer as `window.electron`. Implemented by apps/desktop's preload
 * script and consumed type-safely by apps/id (see
 * apps/id/src/lib/desktop/useIsDesktop.ts). Single source of truth so the
 * preload implementation and the web consumer cannot drift.
 */

export type DesktopPlatform = "darwin" | "win32" | "linux";

export interface DesktopNotification {
  title: string;
  body: string;
  /**
   * Optional in-app target opened when the notification is clicked.
   * Routed through the kinetiks:// deep-link handler in a later phase;
   * accepted now so the bridge contract stays stable.
   */
  deepLink?: string;
}

export interface KinetiksDesktopBridge {
  /** Always true inside the desktop shell; the property is absent in a browser. */
  readonly isDesktop: true;
  /** Host OS platform. */
  readonly platform: DesktopPlatform;
  /** Fire a native OS notification. */
  showNotification: (notification: DesktopNotification) => void;
  /**
   * Subscribe to `kinetiks://` deep links routed from the OS (notification
   * clicks, protocol activations). The callback receives an in-app path (e.g.
   * `/chat?approval=…`, `/chat/{id}`, `/embed?…`) to client-side navigate to.
   * Returns an unsubscribe function.
   */
  onDeepLink: (callback: (path: string) => void) => () => void;
}
