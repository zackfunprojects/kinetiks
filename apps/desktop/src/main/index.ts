import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { createTray } from "./tray";
import { setupNotifications } from "./notifications";
import { loadWindowState, trackWindowState } from "./window-state";

const isDev = !app.isPackaged;
const APP_URL = isDev ? "http://localhost:3000" : "https://kinetiks.ai";
const APP_ORIGIN = new URL(APP_URL).origin;

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

function createWindow() {
  const state = loadWindowState();
  const isMac = process.platform === "darwin";

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#0d1117",
    // macOS vibrancy becomes visible once the in-app chrome goes
    // transparent (Phase 2 titlebar). Harmless behind opaque content;
    // omitted entirely off macOS.
    ...(isMac
      ? { vibrancy: "under-window" as const, visualEffectState: "active" as const }
      : {}),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // This is an app window, not a browser tab: no pinch / cmd-scroll zoom.
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1);

  // Keep navigation inside the app origin. Anything else (an external
  // link clicked in-page) opens in the system browser rather than
  // hijacking the app window.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(url).origin === APP_ORIGIN;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) {
      event.preventDefault();
      if (url.startsWith("http")) void shell.openExternal(url).catch(() => {});
    }
  });

  // target=_blank / window.open links open in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      void shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  trackWindowState(mainWindow);

  // Hide to tray instead of quitting.
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray(mainWindow!);
  setupNotifications();

  app.on("activate", () => {
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Allow app.quit() to actually quit (used by tray).
app.on("before-quit", () => {
  isQuitting = true;
});
