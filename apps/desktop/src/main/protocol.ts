import { app, BrowserWindow } from "electron";
import path from "node:path";

/**
 * `kinetiks://` deep-link handling.
 *
 * Lets native notifications, the agent-communication layer, and OS-level links
 * open the desktop app to a specific surface. Links are parsed to an in-app
 * path and delivered to the renderer over IPC (`kinetiks:deep-link`), which
 * does client-side navigation. If the window/renderer isn't ready yet (cold
 * start), the link is queued and flushed on `did-finish-load`.
 */

const PROTOCOL = "kinetiks";

let pendingPath: string | null = null;

/**
 * Resolve a deep-link input to an in-app path. Accepts a `kinetiks://` URL or
 * an already-resolved app path (starting with `/`). Returns null if it can't
 * be mapped to a known surface.
 */
export function resolveToAppPath(input: string): string | null {
  if (input.startsWith("/")) return input;
  return deepLinkToPath(input);
}

/** Parse a `kinetiks://...` URL into an in-app path, or null if unrecognized. */
export function deepLinkToPath(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${PROTOCOL}:`) return null;

  // kinetiks://approval/{id} -> host="approval", pathname="/{id}"
  const segments = [parsed.host, ...parsed.pathname.split("/")].filter(Boolean);
  const [kind, ...rest] = segments;

  switch (kind) {
    case "approval":
      return rest[0] ? `/chat?approval=${encodeURIComponent(rest[0])}` : null;
    case "thread":
      return rest[0] ? `/chat/${encodeURIComponent(rest[0])}` : null;
    case "embed":
      return rest[0] && rest[1]
        ? `/embed?app=${encodeURIComponent(rest[0])}&entity=${encodeURIComponent(
            rest[1]
          )}&mode=collaborative`
        : null;
    case "chat":
      return "/chat";
    default:
      return null;
  }
}

/** Deliver a deep link to the renderer, or queue it until the window is ready. */
export function routeDeepLink(win: BrowserWindow | null, input: string): void {
  const appPath = resolveToAppPath(input);
  if (!appPath) return;

  if (win && !win.webContents.isLoading()) {
    win.webContents.send("kinetiks:deep-link", appPath);
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  } else {
    pendingPath = appPath;
  }
}

/** Flush a queued deep link once the renderer has finished loading. */
export function flushPendingDeepLink(win: BrowserWindow): void {
  if (pendingPath) {
    win.webContents.send("kinetiks:deep-link", pendingPath);
    pendingPath = null;
  }
}

/** Register `kinetiks://` as the default protocol client + the macOS open-url hook. */
export function registerProtocol(getWindow: () => BrowserWindow | null): void {
  if (process.defaultApp && process.argv.length >= 2) {
    // Dev: electron is the exec; register with the script path so the OS can
    // relaunch us with the protocol arg.
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }

  // macOS delivers protocol links via open-url.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    routeDeepLink(getWindow(), url);
  });
}

/** Extract a kinetiks:// link from a process argv list (Windows/Linux delivery). */
export function deepLinkFromArgv(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`)) ?? null;
}
