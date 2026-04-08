"use client";

import { useEffect, useRef } from "react";
import {
  initAnalytics,
  attachUnloadFlush,
} from "@/lib/analytics";
import { hashUserId } from "@/lib/analytics/hash";

const APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0-dev";

interface SessionShape {
  user_id_hash: string | null;
  user_tier: "free" | "standard" | "hero" | null;
  user_track: "minimal" | "standard" | "hero" | null;
}

/**
 * Client-side bootstrap that wires `initAnalytics` with the current
 * Kinetiks ID session context.
 *
 * Phase 2.5 hardening (per CodeRabbit on PR #42):
 *
 *   1. Re-runs whenever the tab regains focus or visibility, so a tab
 *      that started anonymous picks up the authenticated context after
 *      sign-in without requiring a hard refresh.
 *
 *   2. Reads `track` from /api/account/me (the route now returns it)
 *      so user_track stops being null on the first authenticated pass.
 *
 *   3. Skips the network round-trip when nothing has changed since
 *      the last successful resolution, avoiding a request storm on
 *      tabs that flip focus rapidly.
 */
export function AnalyticsBootstrap() {
  // Track the last context we sent to initAnalytics so we can no-op
  // when the resolution hasn't changed. Comparing on a serialized
  // shape is fine for this small payload.
  const lastSerializedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sessionId = ensureSessionId();
    const platform = detectPlatform();

    async function resolve(): Promise<SessionShape | null> {
      try {
        const res = await fetch("/api/account/me", {
          credentials: "include",
        });
        if (!res.ok) {
          // Anonymous (401) or transient failure — return a placeholder
          // so analytics still has session_id + platform context.
          return null;
        }
        const json = (await res.json()) as {
          user_id?: string;
          tier?: "free" | "standard" | "hero";
          track?: "minimal" | "standard" | "hero" | null;
        };
        const userIdHash = json.user_id ? await hashUserId(json.user_id) : null;
        return {
          user_id_hash: userIdHash,
          user_tier: json.tier ?? null,
          user_track: json.track ?? null,
        };
      } catch {
        return null;
      }
    }

    async function bootstrap() {
      const session = (await resolve()) ?? {
        user_id_hash: null,
        user_tier: null,
        user_track: null,
      };
      if (cancelled) return;

      const serialized = JSON.stringify(session);
      if (lastSerializedRef.current === serialized) {
        // Nothing changed since last resolve. Skip the re-init to
        // avoid clobbering already-stamped events.
        return;
      }
      lastSerializedRef.current = serialized;

      initAnalytics({
        ...session,
        session_id: sessionId,
        platform,
        app_version: APP_VERSION,
      });
    }

    void bootstrap();
    attachUnloadFlush();

    // Re-resolve on focus + visibilitychange so a tab that picked up
    // the auth cookie via id.kinetiks.ai sign-in (typically in another
    // tab) finds out about it without a hard refresh.
    const onFocus = () => void bootstrap();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void bootstrap();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
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
