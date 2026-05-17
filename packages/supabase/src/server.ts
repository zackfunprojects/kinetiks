import { createServerClient as createSupabaseServerClient, type CookieOptions } from "@supabase/ssr";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export function createServerClient(cookieStore: ReadonlyRequestCookies) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }: CookieToSet) => {
          try {
            cookieStore.set(name, value, {
              ...options,
              domain: ".kinetiks.ai",
            });
          } catch {
            // ReadonlyRequestCookies can't set in Server Components
          }
        });
      },
    },
  });
}
