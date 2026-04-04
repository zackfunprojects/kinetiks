import { Notification, ipcMain } from "electron";

export function setupNotifications() {
  ipcMain.on("show-notification", (_event, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title,
        body,
      });
      notification.show();
    }
  });
}
