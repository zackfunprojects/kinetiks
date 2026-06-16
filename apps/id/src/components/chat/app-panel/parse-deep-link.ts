import type { AppPanelTarget } from "./AppPanelContext";

/**
 * Parse an embed-style deep link (`/embed?app=&entity=`) into a panel target,
 * or null if it isn't an embeddable surface. Non-embed deep links (external
 * URLs, `/cortex/...` routes) return null and keep their existing behavior
 * (open externally / navigate), per spec §4.2.3.
 */
export function parseEmbedDeepLink(deepLink: string): AppPanelTarget | null {
  const base =
    typeof window !== "undefined" ? window.location.origin : "http://local";
  let url: URL;
  try {
    // Base lets relative links (`/embed?...`) resolve to our origin; absolute
    // links keep theirs and are checked below.
    url = new URL(deepLink, base);
  } catch {
    return null;
  }
  // Only a same-origin embed surface mounts in-panel — a cross-origin link with
  // an /embed path is not our surface and must not be treated as an embed.
  if (typeof window !== "undefined" && url.origin !== window.location.origin) {
    return null;
  }
  if (url.pathname !== "/embed") return null;

  const app = url.searchParams.get("app");
  if (!app) return null;

  return {
    app,
    entity: url.searchParams.get("entity") ?? undefined,
    mode: "collaborative",
  };
}
