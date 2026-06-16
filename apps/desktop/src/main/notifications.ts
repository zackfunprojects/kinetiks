import { Notification, ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import type { DesktopNotification } from "@kinetiks/types";
import { routeDeepLink } from "./protocol";

export function setupNotifications(getWindow: () => BrowserWindow | null) {
  ipcMain.on("show-notification", (_event, payload: DesktopNotification) => {
    if (!Notification.isSupported()) return;
    const { title, body, deepLink } = payload;
    const notification = new Notification({ title, body });
    if (deepLink) {
      // Clicking the notification opens the app to its target surface.
      notification.on("click", () => routeDeepLink(getWindow(), deepLink));
    }
    notification.show();
  });
}
