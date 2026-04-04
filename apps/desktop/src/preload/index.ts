import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  isDesktop: true,
  platform: process.platform,
  showNotification: (title: string, body: string) => {
    ipcRenderer.send("show-notification", { title, body });
  },
});
