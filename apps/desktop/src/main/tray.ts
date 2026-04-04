import { Tray, Menu, nativeImage, app, BrowserWindow } from "electron";
import path from "path";
import fs from "fs";

// 16x16 transparent PNG placeholder for when no icon asset exists
const FALLBACK_ICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAADRJREFUOI1jYBhowMjAwPCfgYGBgZGBgeE/AwMDA8P/////MzIw/GdgYPjPwMDAwIBLPQMAJ0YGCPXjsSwAAAAASUVORK5CYII=";

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow) {
  const iconPath = getTrayIconPath();
  const icon = iconPath
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(
    icon.isEmpty() ? nativeImage.createFromDataURL(FALLBACK_ICON_DATA_URL) : icon
  );

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
  const candidates = [
    path.join(__dirname, "../../assets/trayTemplate.png"),
    path.join(__dirname, "../../assets/tray.png"),
    path.join(__dirname, "../../assets/icon.png"),
  ];

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate);
      return candidate;
    } catch {
      // File doesn't exist, try next
    }
  }

  return "";
}
