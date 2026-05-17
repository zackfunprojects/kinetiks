"use client";

import { ThemeProvider, ToastProvider, type Theme } from "@kinetiks/ui";
import { useEffect, useRef, type ReactNode } from "react";
import { useTheme } from "@kinetiks/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Top-level providers for apps/id.
 *
 * Theme:
 *  - Initial theme is read at pre-paint (script in app/layout.tsx)
 *  - ThemeProvider manages local state + localStorage cache
 *  - SupabaseThemeSync (inside the provider tree) reconciles with the
 *    user's persisted preference once auth is available
 *
 * Toasts: ToastProvider mounts a fixed-position region used app-wide.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider onThemeChange={persistThemeToSupabase}>
      <ToastProvider>
        <SupabaseThemeSync />
        {children}
      </ToastProvider>
    </ThemeProvider>
  );
}

async function persistThemeToSupabase(next: Theme): Promise<void> {
  if (typeof window === "undefined") return;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return; // unauth users: localStorage-only
  await supabase
    .from("kinetiks_user_preferences")
    .upsert(
      { user_id: user.id, theme: next },
      { onConflict: "user_id" },
    );
}

/**
 * Pulls the user's persisted theme preference from Supabase once after mount
 * and reconciles it with the locally-applied theme. Runs only when a user is
 * authenticated; unauthenticated visitors stay on localStorage/system pref.
 */
function SupabaseThemeSync() {
  const { theme, setTheme } = useTheme();
  const reconciledRef = useRef(false);

  useEffect(() => {
    if (reconciledRef.current) return;
    reconciledRef.current = true;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data, error } = await supabase
        .from("kinetiks_user_preferences")
        .select("theme")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        // eslint-disable-next-line no-console
        console.warn("[theme] failed to read user preference", error.message);
        return;
      }
      const persisted = data?.theme as Theme | undefined;
      if (persisted === "light" || persisted === "dark") {
        if (persisted !== theme) setTheme(persisted);
      } else {
        // Initialize the row with the current theme so future devices match
        await supabase
          .from("kinetiks_user_preferences")
          .upsert(
            { user_id: user.id, theme },
            { onConflict: "user_id" },
          );
      }
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[theme] reconcile failed", err);
    });
    return () => {
      cancelled = true;
    };
    // Intentionally only run once after mount; the theme change handler in the
    // provider already round-trips writes back to Supabase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
