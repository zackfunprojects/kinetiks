import { app, session, shell } from "electron";
import path from "node:path";

/**
 * Hardened `<webview>` substrate for the collaborative multi-app panel
 * (collaborative-workspace-spec §4.4/§14.3). This slice secures the substrate;
 * the webview manager + 3-webview LRU + collaborative IPC relay land in 8.7.
 *
 * Defense in depth, applied to EVERY attached webview regardless of what the
 * `<webview>` tag requested:
 *   - force our webview preload + contextIsolation, disable nodeIntegration
 *   - lock every webview to the collaborative persist partition
 *   - lock navigation to Kinetiks origins; external links open in the system browser
 *   - deny window.open; deny all but a minimal permission allowlist
 */

export const COLLAB_PARTITION = "persist:collaborative";

const PERMISSION_ALLOWLIST = new Set<string>([
  "clipboard-read",
  "clipboard-sanitized-write",
]);

function isAllowedOrigin(url: string, allowed: string[]): boolean {
  // Exact allowlist only (covers dev http://localhost:3000 and the embed
  // origins the panel actually loads). No `*.kinetiks.ai` wildcard: once the
  // collaborative partition holds the mirrored `.kinetiks.ai` session cookie
  // (Phase 8.7 D2), letting a webview navigate to an arbitrary Kinetiks
  // subdomain would expose that token to a sibling origin. The navigation
  // boundary and the cookie-mirror scope must stay the same set — suite-app
  // embed origins get added to `getAllowedOrigins()` (and mirrored) together.
  try {
    return allowed.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

export function configureWebviewSecurity(getAllowedOrigins: () => string[]): void {
  app.on("web-contents-created", (_event, contents) => {
    // Harden a webview's prefs before it attaches. partition goes on
    // webPreferences (the authoritative session field) — setting it on the tag
    // params is ignored, which would let a caller bypass persist:collaborative.
    contents.on("will-attach-webview", (_e, webPreferences, _params) => {
      webPreferences.preload = path.join(__dirname, "../preload/webview.js");
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.partition = COLLAB_PARTITION;
    });

    if (contents.getType() !== "webview") return;

    // Lock navigation to Kinetiks origins; everything else goes to the browser.
    contents.on("will-navigate", (event, url) => {
      if (!isAllowedOrigin(url, getAllowedOrigins())) {
        event.preventDefault();
        if (url.startsWith("http")) void shell.openExternal(url).catch(() => {});
      }
    });

    // No webview-spawned windows; external links open in the system browser.
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("http")) void shell.openExternal(url).catch(() => {});
      return { action: "deny" };
    });
  });

  // Default-deny permissions on the collaborative partition.
  const collab = session.fromPartition(COLLAB_PARTITION);
  collab.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(PERMISSION_ALLOWLIST.has(permission));
  });
}
