import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getCookieDomain(): string | undefined {
  if (process.env.COOKIE_DOMAIN) return process.env.COOKIE_DOMAIN;
  // In production, derive from known kinetiks.ai domain
  if (process.env.NODE_ENV === "production") return ".kinetiks.ai";
  return undefined;
}

export function createClient() {
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
