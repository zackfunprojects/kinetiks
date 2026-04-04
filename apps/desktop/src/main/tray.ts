import { Tray, Menu, app, BrowserWindow } from "electron";

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow) {
  // Use a template image on macOS for proper menu bar integration
  // For now, use a placeholder - replace with actual icon path later
  tray = new Tray(getTrayIconPath());

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Kinetiks",
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: "Hide Kinetiks",
      click: () => {
        mainWindow.hide();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        (app as { isQuitting?: boolean }).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Kinetiks AI");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function getTrayIconPath(): string {
  // Placeholder - will be replaced with actual icon asset
  // On macOS, use a 16x16 or 22x22 Template image
  // For now, return empty string which will show default
  return "";
}
