import { Menu, BrowserWindow } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import type { DesktopMenuAction } from "@kinetiks/types";

/** Send a menu/accelerator action to the focused renderer (spec-addendum-chat-ux §B.4). */
function send(action: DesktopMenuAction): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  win?.webContents.send("kinetiks:menu", action);
}

/**
 * Build and install the application menu. Standard roles for OS-expected
 * behavior (Edit/View/Window), plus Kinetiks navigation accelerators that emit
 * IPC the renderer turns into shell actions (tab switch, palette, etc.).
 */
export function buildAppMenu(): void {
  const isMac = process.platform === "darwin";

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    {
      label: "File",
      submenu: [
        { label: "New Thread", accelerator: "CmdOrCtrl+N", click: () => send("new-thread") },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Chat", accelerator: "CmdOrCtrl+1", click: () => send("tab:chat") },
        { label: "Analytics", accelerator: "CmdOrCtrl+2", click: () => send("tab:analytics") },
        { label: "Cortex", accelerator: "CmdOrCtrl+3", click: () => send("tab:cortex") },
        { type: "separator" },
        { label: "Approvals", accelerator: "CmdOrCtrl+Shift+A", click: () => send("approvals") },
        { label: "Command Palette", accelerator: "CmdOrCtrl+K", click: () => send("palette") },
        { label: "Settings", accelerator: "CmdOrCtrl+,", click: () => send("settings") },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
