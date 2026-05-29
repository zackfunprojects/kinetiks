import { app, BrowserWindow } from "electron";
import type { Rectangle } from "electron";
import path from "path";
import fs from "fs";

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

const DEFAULTS: WindowState = { width: 1280, height: 800 };

function stateFile(): string {
  return path.join(app.getPath("userData"), "window-state.json");
}

/** Saved window bounds, or sensible defaults on first launch. */
export function loadWindowState(): WindowState {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile(), "utf-8")) as Partial<WindowState>;
    if (typeof parsed.width === "number" && typeof parsed.height === "number") {
      return {
        width: parsed.width,
        height: parsed.height,
        x: typeof parsed.x === "number" ? parsed.x : undefined,
        y: typeof parsed.y === "number" ? parsed.y : undefined,
      };
    }
  } catch {
    // No saved state (first launch) or unreadable - fall back to defaults.
  }
  return { ...DEFAULTS };
}

function persist(win: BrowserWindow): void {
  if (win.isDestroyed() || win.isMinimized()) return;
  const bounds: Rectangle = win.getBounds();
  try {
    fs.writeFileSync(
      stateFile(),
      JSON.stringify({ width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y })
    );
  } catch {
    // Best-effort; a lost window position is not worth crashing over.
  }
}

/** Persist bounds on resize/move (debounced) and on close. */
export function trackWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => persist(win), 400);
  };
  win.on("resize", schedule);
  win.on("move", schedule);
  win.on("close", () => persist(win));
}
