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
  try {
    const parsed = new URL(url);
    // Exact allowlist (covers dev http://localhost:3000) first.
    if (allowed.includes(parsed.origin)) return true;
    // Wildcard Kinetiks subdomains are HTTPS-only — never honor a downgraded
    // or non-TLS scheme for the navigation boundary.
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname;
    return host === "kinetiks.ai" || host.endsWith(".kinetiks.ai");
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
