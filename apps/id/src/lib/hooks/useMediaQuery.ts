"use client";

import { useEffect, useState } from "react";

/**
 * The wide-viewport breakpoint for the collaborative workspace (spec §3.2):
 * at/above this width the app panel is a split column and multi-app side-by-side
 * is offered; below it the panel is a slide-over. Centralized so the split
 * panel + multi-app code share one source. (CSS variables can't be used inside
 * media-query conditions, so this is a JS constant.)
 */
export const WIDE_VIEWPORT_QUERY = "(min-width: 1280px)";

/**
 * SSR-safe media query hook. Returns `false` on the server and the first client
 * render (avoids hydration mismatch), then resolves to the real match.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
