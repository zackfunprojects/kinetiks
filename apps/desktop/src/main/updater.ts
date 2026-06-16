import { app, ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import type { DesktopUpdateStatus } from "@kinetiks/types";
import { captureDesktopException } from "./observability";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6h

let started = false;

function emit(getWindow: () => BrowserWindow | null, status: DesktopUpdateStatus): void {
  getWindow()?.webContents.send("kinetiks:update", status);
}

/**
 * Wire electron-updater (spec §16.2). Checks on launch + every 6h; forwards
 * available/downloaded/error to the renderer for the update toast. Downloads
 * in the background and installs on the next quit, with an opt-in "Restart now"
 * (the `applyUpdate` bridge method).
 *
 * No-op in dev (`autoUpdater` requires a packaged app + a configured publish
 * feed — see electron-builder.yml `publish` and docs/operational/env-vars.md).
 */
export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (started || !app.isPackaged) return;
  started = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) =>
    emit(getWindow, { phase: "available", version: info.version })
  );
  autoUpdater.on("update-downloaded", (info) =>
    emit(getWindow, { phase: "downloaded", version: info.version })
  );
  autoUpdater.on("error", (err) => {
    captureDesktopException(err);
    emit(getWindow, { phase: "error", message: "Update check failed" });
  });

  ipcMain.on("kinetiks:apply-update", () => {
    autoUpdater.quitAndInstall();
  });

  const check = () => {
    void autoUpdater.checkForUpdates().catch((err) => captureDesktopException(err));
  };
  check();
  setInterval(check, CHECK_INTERVAL_MS);
}
