"use client";

import { useEffect } from "react";

/**
 * Registers the DeskOf service worker on first paint.
 *
 * The service worker is the offline persistence layer for draft
 * replies (Final Supplement §1.3 — "user's written text is NEVER
 * lost"). Without it, a reload mid-draft loses state because the
 * editor's component state vanishes.
 *
 * The SW itself lives at /sw.js and ships only the local-cache logic
 * needed to keep drafts safe. Phase 8 will expand it for full PWA
 * offline reading + push notifications.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          console.error("DeskOf SW registration failed:", err);
        });
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad);
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);

  return null;
}
