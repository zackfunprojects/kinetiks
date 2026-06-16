import type { AppPanelTarget } from "./AppPanelContext";

/**
 * Parse an embed-style deep link (`/embed?app=&entity=`) into a panel target,
 * or null if it isn't an embeddable surface. Non-embed deep links (external
 * URLs, `/cortex/...` routes) return null and keep their existing behavior
 * (open externally / navigate), per spec §4.2.3.
 */
export function parseEmbedDeepLink(deepLink: string): AppPanelTarget | null {
  let url: URL;
  try {
    // Base lets relative links (`/embed?...`) parse; absolute links keep theirs.
    url = new URL(deepLink, "http://local");
  } catch {
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
