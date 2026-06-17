import { session, type Session } from "electron";
import { COLLAB_PARTITION } from "./webview";
import { captureDesktopException } from "./observability";
import {
  cookieAppliesToHost,
  cookieMirrorUrl,
  cookieSetParamsForMirror,
  cookieToSetDetails,
} from "./session-sync-cookies";

/**
 * Authenticate the collaborative webviews without merging partitions (Phase 8.7
 * D2). The main renderer holds the id.kinetiks.ai session in the DEFAULT
 * partition; the hardened webviews live in `persist:collaborative` (8.1).
 * Electron partitions are isolated cookie jars, so we mirror the app-origin
 * cookies from the default session into the collaborative session and keep them
 * in sync. The collab partition's permission/navigation locks (8.1) are
 * untouched — only its cookie jar is seeded.
 */
export function startSessionMirror(appUrl: string): void {
  let host: string;
  try {
    host = new URL(appUrl).hostname; // no port — cookie domains never carry one
  } catch {
    return; // a malformed app URL is handled upstream; nothing to mirror.
  }
  const source = session.defaultSession;
  const target = session.fromPartition(COLLAB_PARTITION);

  // Initial copy of whatever session already exists.
  void copyAll(source, target, appUrl);

  // Keep the collaborative jar in sync as the renderer logs in / refreshes / out.
  source.cookies.on("changed", (_event, cookie, _cause, removed) => {
    if (!cookieAppliesToHost(cookie, host)) return;
    void (async () => {
      try {
        if (removed) {
          await target.cookies.remove(cookieMirrorUrl(cookie, appUrl), cookie.name);
        } else {
          await target.cookies.set(cookieToSetDetails(cookie, appUrl));
        }
      } catch (err) {
        captureDesktopException(err, { stage: "session_mirror_sync" });
      }
    })();
  });
}

async function copyAll(source: Session, target: Session, appUrl: string): Promise<void> {
  try {
    const cookies = await source.cookies.get({ url: appUrl });
    for (const params of cookieSetParamsForMirror(cookies, appUrl)) {
      await target.cookies
        .set(params)
        .catch((err) => captureDesktopException(err, { stage: "session_mirror_set" }));
    }
  } catch (err) {
    captureDesktopException(err, { stage: "session_mirror_copy" });
  }
}
