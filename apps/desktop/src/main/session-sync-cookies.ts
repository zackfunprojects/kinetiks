import type { Cookie, CookiesSetDetails } from "electron";

/**
 * Pure cookie-mirror logic (Phase 8.7 D2), isolated from the Electron `session`
 * I/O so it can be unit-tested in node. Decides which cookies cross from the
 * default session into the collaborative partition and how each maps to a
 * `cookies.set` payload.
 */

function normalizeDomain(domain: string | undefined): string {
  return (domain ?? "").replace(/^\./, "").toLowerCase();
}

/** Does this cookie apply to the app's host? Domain cookies cover subdomains;
 *  hostOnly cookies must match the host exactly. */
export function cookieAppliesToHost(
  cookie: Pick<Cookie, "domain" | "hostOnly">,
  host: string,
): boolean {
  const domain = normalizeDomain(cookie.domain);
  const h = host.toLowerCase();
  if (!domain) return false;
  if (cookie.hostOnly) return domain === h;
  return h === domain || h.endsWith(`.${domain}`);
}

/** The scheme://host/path URL a mirrored cookie is scoped to (used by set + remove). */
export function cookieMirrorUrl(cookie: Pick<Cookie, "path">, appUrl: string): string {
  const base = new URL(appUrl);
  const path = cookie.path && cookie.path.length > 0 ? cookie.path : "/";
  return `${base.protocol}//${base.host}${path}`;
}

export function cookieToSetDetails(cookie: Cookie, appUrl: string): CookiesSetDetails {
  return {
    url: cookieMirrorUrl(cookie, appUrl),
    name: cookie.name,
    value: cookie.value,
    // hostOnly cookies are scoped by the url host; domain cookies keep their domain.
    domain: cookie.hostOnly ? undefined : cookie.domain,
    path: cookie.path && cookie.path.length > 0 ? cookie.path : "/",
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    expirationDate: cookie.expirationDate,
  };
}

/** Map the app-origin cookies to `cookies.set` payloads for the collaborative
 *  partition; cookies that don't apply to the app host are dropped. */
export function cookieSetParamsForMirror(
  cookies: readonly Cookie[],
  appUrl: string,
): CookiesSetDetails[] {
  const host = new URL(appUrl).host;
  return cookies
    .filter((c) => cookieAppliesToHost(c, host))
    .map((c) => cookieToSetDetails(c, appUrl));
}
