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
};

contextBridge.exposeInMainWorld("electron", bridge);
