import { PANEL_MESSAGE_SOURCE, PANEL_IPC_CHANNEL, type PanelMessage } from "@kinetiks/types";

/**
 * The shell ↔ embed coordination channel (spec §4.4, §10.4; Phase 8.7 D1).
 *
 * One contract (`PanelMessage`), two transports: the web iframe uses
 * parent↔iframe `postMessage`; the desktop `<webview>` uses host↔guest IPC.
 * This carries COORDINATION only (ready / init / focus / delegate / visibility /
 * ui_state) — the embed does its own Realtime + API directly. App-agnostic and
 * Electron-free: the webview adapters take structural shapes, not Electron types.
 */

// Re-export the shared IPC channel constant (defined in @kinetiks/types so the
// desktop preload and these adapters cannot drift).
export { PANEL_IPC_CHANNEL };

/** A bidirectional coordination channel between the shell and the embed. */
export interface PanelBridge {
  post(message: PanelMessage): void;
  /** Subscribe to inbound messages. Returns an unsubscribe fn. */
  subscribe(handler: (message: PanelMessage) => void): () => void;
  dispose(): void;
}

export type GuestBridgeKind = "webview" | "postmessage" | "none";

/** Which guest transport the embed should use: the desktop webview IPC bridge
 *  when present, else parent↔iframe postMessage when embedded, else none
 *  (a standalone `/embed`). Pure so the selection is unit-tested. */
export function guestBridgeKind(hasWebviewBridge: boolean, isEmbedded: boolean): GuestBridgeKind {
  if (hasWebviewBridge) return "webview";
  if (isEmbedded) return "postmessage";
  return "none";
}

/** Validate an inbound payload before trusting it — paired with the origin
 *  check on the postMessage path, and the only gate on the IPC path. */
export function isPanelMessage(data: unknown): data is PanelMessage {
  if (typeof data !== "object" || data === null) return false;
  const m = data as { source?: unknown; type?: unknown };
  if (m.source !== PANEL_MESSAGE_SOURCE) return false;
  return (
    m.type === "ready" ||
    m.type === "init" ||
    m.type === "focus" ||
    m.type === "delegate" ||
    m.type === "visibility" ||
    m.type === "ui_state"
  );
}

// ── postMessage transport (web iframe ↔ shell) ──────────────────────────────
// Window-likes are injected (not read from a global) so the bridge is testable
// without a DOM and carries no hidden environment coupling.

interface PostMessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}
interface MessageListenerHost {
  addEventListener(type: "message", listener: (e: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (e: MessageEvent) => void): void;
}

export interface PostMessageBridgeOptions {
  /** Outbound target (iframe.contentWindow for the host; window.parent for the guest). */
  target: PostMessageTarget | null;
  /** The window whose `message` events we listen on (the local window). */
  host: MessageListenerHost;
  /** Required inbound origin AND outbound targetOrigin (the embed is same-origin). */
  origin: string;
  onError?: (err: unknown) => void;
}

export function createPostMessageBridge(opts: PostMessageBridgeOptions): PanelBridge {
  const { target, host, origin, onError } = opts;
  const handlers = new Set<(m: PanelMessage) => void>();

  const onMessage = (e: MessageEvent) => {
    if (e.origin !== origin) return; // strict same-origin
    if (!isPanelMessage(e.data)) return; // source + type
    handlers.forEach((h) => h(e.data as PanelMessage));
  };
  host.addEventListener("message", onMessage);

  return {
    post(message) {
      try {
        target?.postMessage(message, origin);
      } catch (err) {
        onError?.(err);
      }
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    dispose() {
      handlers.clear();
      host.removeEventListener("message", onMessage);
    },
  };
}

// ── webview transport (desktop <webview> host ↔ guest) ──────────────────────

/** Structural shape of a `<webview>` element (host side); keeps this package
 *  free of Electron types. The real DOM element matches it. */
export interface WebviewHostElement {
  send(channel: string, payload: PanelMessage): void;
  addEventListener(
    type: "ipc-message",
    listener: (e: { channel: string; args: unknown[] }) => void,
  ): void;
  removeEventListener(
    type: "ipc-message",
    listener: (e: { channel: string; args: unknown[] }) => void,
  ): void;
}

export function createWebviewHostBridge(
  webview: WebviewHostElement,
  onError?: (err: unknown) => void,
): PanelBridge {
  const handlers = new Set<(m: PanelMessage) => void>();
  const onIpc = (e: { channel: string; args: unknown[] }) => {
    if (e.channel !== PANEL_IPC_CHANNEL) return;
    const payload = e.args[0];
    if (!isPanelMessage(payload)) return;
    handlers.forEach((h) => h(payload));
  };
  webview.addEventListener("ipc-message", onIpc);

  return {
    post(message) {
      try {
        webview.send(PANEL_IPC_CHANNEL, message);
      } catch (err) {
        onError?.(err);
      }
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    dispose() {
      handlers.clear();
      webview.removeEventListener("ipc-message", onIpc);
    },
  };
}

/** Guest-side IPC api exposed by the desktop webview preload (`electronWebview`). */
export interface WebviewGuestApi {
  sendToHost(message: PanelMessage): void;
  onHostMessage(handler: (message: PanelMessage) => void): () => void;
}

export function createWebviewGuestBridge(
  api: WebviewGuestApi,
  onError?: (err: unknown) => void,
): PanelBridge {
  const handlers = new Set<(m: PanelMessage) => void>();
  const off = api.onHostMessage((message) => {
    if (!isPanelMessage(message)) return;
    handlers.forEach((h) => h(message));
  });

  return {
    post(message) {
      try {
        api.sendToHost(message);
      } catch (err) {
        onError?.(err);
      }
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    dispose() {
      handlers.clear();
      off();
    },
  };
}
