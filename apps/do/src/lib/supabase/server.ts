import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client for DeskOf, mirroring apps/id's pattern.
 * Reads the .kinetiks.ai shared cookie so the user is signed in across
 * id.kinetiks.ai and deskof.kinetiks.ai with the same Kinetiks ID.
 *
 * NOTE: We deliberately do NOT import from @kinetiks/supabase here.
 * The package has unresolved type issues that are tracked in a separate
 * follow-up PR. Apps/id mirrors this same pattern with its own local
 * supabase/server.ts.
 */

export function getCookieDomain(host?: string): string | undefined {
  if (process.env.COOKIE_DOMAIN) return process.env.COOKIE_DOMAIN;
  if (host) {
    const hostname = host.split(":")[0];
    if (hostname.endsWith(".kinetiks.ai")) return ".kinetiks.ai";
  }
  return undefined;
}

export function createDeskOfServerClient() {
  const cookieStore = cookies();
  const domain = getCookieDomain();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                domain,
              })
            );
          } catch {
            // Server Components cannot set cookies
          }
        },
      },
    }
  );
}
