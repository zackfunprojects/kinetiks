import { contextBridge, ipcRenderer } from "electron";
import type { DesktopNotification, KinetiksDesktopBridge } from "@kinetiks/types";

// `import type` is erased at compile time, so this adds no runtime
// dependency on @kinetiks/types - the preload stays a standalone bundle.
const bridge: KinetiksDesktopBridge = {
  isDesktop: true,
  platform: process.platform as KinetiksDesktopBridge["platform"],
  showNotification: (notification: DesktopNotification) => {
    ipcRenderer.send("show-notification", notification);
  },
  onDeepLink: (callback: (path: string) => void) => {
    const handler = (_event: unknown, path: string) => callback(path);
    ipcRenderer.on("kinetiks:deep-link", handler);
    return () => {
      ipcRenderer.removeListener("kinetiks:deep-link", handler);
    };
  },
  onMenuAction: (callback) => {
    const handler = (_event: unknown, action: Parameters<typeof callback>[0]) =>
      callback(action);
    ipcRenderer.on("kinetiks:menu", handler);
    return () => {
      ipcRenderer.removeListener("kinetiks:menu", handler);
    };
  },
};

contextBridge.exposeInMainWorld("electron", bridge);
