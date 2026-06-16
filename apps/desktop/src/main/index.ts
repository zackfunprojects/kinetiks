import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { createTray } from "./tray";
import { setupNotifications } from "./notifications";
import { loadWindowState, trackWindowState } from "./window-state";
import {
  registerProtocol,
  routeDeepLink,
  flushPendingDeepLink,
  deepLinkFromArgv,
} from "./protocol";
import { initObservability } from "./observability";
import { buildAppMenu } from "./menu";
import { configureWebviewSecurity } from "./webview";
import { initAutoUpdater } from "./updater";

// Crash reporting first, before any app setup, so startup faults are captured.
initObservability();

const isDev = !app.isPackaged;
// The Core app is served from id.kinetiks.ai. The apex kinetiks.ai is the
// marketing site and 404s the app + /api routes — loading it shipped a dead
// window. Env override allows pointing at a preview/staging origin.
const DEFAULT_APP_URL = isDev ? "http://localhost:3000" : "https://id.kinetiks.ai";

// Desktop main runs in its own Electron process (not the Next app), so it
// validates its single override locally rather than via @kinetiks/lib/env. A
// malformed override falls back to the default instead of throwing at boot.
function resolveAppUrl(): string {
  const override = process.env.KINETIKS_DESKTOP_APP_URL;
  if (override) {
    try {
      new URL(override);
      return override;
    } catch {
      // Ignore a malformed override and use the default.
    }
  }
  return DEFAULT_APP_URL;
}

const APP_URL = resolveAppUrl();
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
      // Enable embedded app panels (collaborative workspace). Every attached
      // webview is hardened in configureWebviewSecurity (forced preload,
      // locked partition, navigation + permission guards).
      webviewTag: true,
    },
  });

  mainWindow.loadURL(APP_URL);

  // Deliver any deep link that arrived before the renderer was ready.
  mainWindow.webContents.on("did-finish-load", () => {
    if (mainWindow) flushPendingDeepLink(mainWindow);
  });

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

// Single-instance: a second launch (incl. an OS protocol activation on
// Windows/Linux) focuses the existing window and routes its deep link instead
// of spawning a second app.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  registerProtocol(() => mainWindow);

  app.on("second-instance", (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    const link = deepLinkFromArgv(argv);
    if (link) routeDeepLink(mainWindow, link);
  });

  app.whenReady().then(() => {
    configureWebviewSecurity(() => [APP_ORIGIN]);
    createWindow();
    createTray(mainWindow!);
    buildAppMenu();
    setupNotifications(() => mainWindow);
    initAutoUpdater(() => mainWindow);

    // Cold start via protocol (Windows/Linux deliver the link in argv).
    const coldLink = deepLinkFromArgv(process.argv);
    if (coldLink) routeDeepLink(mainWindow, coldLink);

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
}
