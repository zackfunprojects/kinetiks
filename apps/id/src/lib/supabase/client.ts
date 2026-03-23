import { createBrowserClient } from "@supabase/ssr";

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
  return url;
}

function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable");
  return key;
}

function getCookieDomain(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const envDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;
  if (envDomain) return envDomain;
  if (window.location.hostname.endsWith(".kinetiks.ai")) return ".kinetiks.ai";
  return undefined;
}

export function createClient() {
  return createBrowserClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookieOptions: {
        domain: getCookieDomain(),
      },
    }
  );
}
