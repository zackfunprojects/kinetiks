"use client";

import { useEffect } from "react";
import {
  initAnalytics,
  attachUnloadFlush,
} from "@/lib/analytics";
import { hashUserId } from "@/lib/analytics/hash";

const APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0-dev";

/**
 * Client-side bootstrap that wires `initAnalytics` once per session
 * with the current user context. Without this component every event
 * fires with the `pendingContext()` placeholder (session_id="pending",
 * tier=null, track=null) and the analytics pipeline is unusable for
 * aggregation.
 *
 * Mounted from the root layout so it runs on every page.
 */
export function AnalyticsBootstrap() {
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const sessionId = ensureSessionId();

      // Try to read the current Kinetiks ID session shape. Anonymous
      // events still get a real session_id; tier/track stay null until
      // the user is signed in (and the next page nav re-runs this).
      let userIdHash: string | null = null;
      let userTier: "free" | "standard" | "hero" | null = null;
      let userTrack: "minimal" | "standard" | "hero" | null = null;

      try {
        const res = await fetch("/api/account/me", {
          credentials: "include",
        });
        if (res.ok) {
          const json = (await res.json()) as {
            user_id?: string;
            tier?: "free" | "standard" | "hero";
            track?: "minimal" | "standard" | "hero";
          };
          if (json.user_id) {
            userIdHash = await hashUserId(json.user_id);
          }
          userTier = json.tier ?? null;
          userTrack = json.track ?? null;
        }
      } catch {
        // Anonymous session — that's fine.
      }

      if (cancelled) return;

      initAnalytics({
        user_id_hash: userIdHash,
        session_id: sessionId,
        user_tier: userTier,
        user_track: userTrack,
        platform: detectPlatform(),
        app_version: APP_VERSION,
      });

      attachUnloadFlush();
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

/**
 * Stable per-tab session id stored in sessionStorage. A page reload
 * keeps the same id; a brand new tab gets a new one.
 */
function ensureSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.sessionStorage.getItem("deskof_session_id");
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.sessionStorage.setItem("deskof_session_id", fresh);
    return fresh;
  } catch {
    // Private mode or storage disabled — fall back to a transient id.
    return crypto.randomUUID();
  }
}

function detectPlatform(): "web" | "pwa" {
  if (typeof window === "undefined") return "web";
  // PWAs launched from the home screen run in standalone display mode
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true;
  return standalone ? "pwa" : "web";
}
