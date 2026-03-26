import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

/**
 * Derive the cookie domain. Priority:
 * 1. COOKIE_DOMAIN env var (explicit override)
 * 2. Host-based detection (if host ends with .kinetiks.ai)
 * 3. undefined (no domain restriction - works for localhost etc.)
 */
export function getCookieDomain(host?: string): string | undefined {
  if (process.env.COOKIE_DOMAIN) return process.env.COOKIE_DOMAIN;
  if (host) {
    const hostname = host.split(":")[0];
    if (hostname.endsWith(".kinetiks.ai")) return ".kinetiks.ai";
  }
  return undefined;
}

export function createClient() {
  const cookieStore = cookies();
  const host = headers().get("host") ?? undefined;
  const domain = getCookieDomain(host);

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                domain,
              })
            );
          } catch {
            // Server Component can't set cookies
          }
        },
      },
    }
  );
}
