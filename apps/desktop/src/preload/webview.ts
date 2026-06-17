import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { PANEL_IPC_CHANNEL, type KinetiksWebviewBridge, type PanelMessage } from "@kinetiks/types";

/**
 * Preload for embedded `<webview>` surfaces (the collaborative app panel).
 *
 * Exposes `window.electronWebview`: the embed detects it's in a desktop webview
 * AND gets the shell↔embed coordination relay (Phase 8.7). Per D1 this carries
 * COORDINATION only (ready / focus / delegate / visibility) — the embed does its
 * own Realtime + API directly over its (session-mirrored) web context.
 *
 * `sendToHost` posts to the host renderer (the `<webview>` element's owner);
 * `onHostMessage` receives `webview.send(PANEL_IPC_CHANNEL, …)` from the host.
 * contextIsolation is enforced from the main process (will-attach-webview), so
 * this contextBridge is the only channel; payloads are structured-clone-safe.
 */
const bridge: KinetiksWebviewBridge = {
  isWebview: true,
  sendToHost: (message: PanelMessage) => {
    ipcRenderer.sendToHost(PANEL_IPC_CHANNEL, message);
  },
  onHostMessage: (handler: (message: PanelMessage) => void) => {
    const listener = (_event: IpcRendererEvent, message: PanelMessage) => handler(message);
    ipcRenderer.on(PANEL_IPC_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(PANEL_IPC_CHANNEL, listener);
    };
  },
};

contextBridge.exposeInMainWorld("electronWebview", bridge);
