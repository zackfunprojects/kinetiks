import { contextBridge } from "electron";

/**
 * Preload for embedded `<webview>` surfaces (the collaborative app panel).
 * Phase 8.1 ships a minimal, hardened seam: the surface can detect it's hosted
 * in a Kinetiks desktop webview. The collaborative IPC relay (presence,
 * annotations, undo) is layered on in Phase 8.7. contextIsolation is enforced
 * from the main process (will-attach-webview), so this is the only bridge.
 */
contextBridge.exposeInMainWorld("electronWebview", {
  isWebview: true as const,
});
