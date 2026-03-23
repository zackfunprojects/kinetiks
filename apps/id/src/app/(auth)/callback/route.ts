import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function getCookieDomain(request: NextRequest): string | undefined {
  const cookieDomain = process.env.COOKIE_DOMAIN;
  if (cookieDomain) return cookieDomain;
  const host = request.headers.get("host") ?? "";
  if (host.endsWith(".kinetiks.ai")) return ".kinetiks.ai";
  return undefined;
}

/**
 * Validate the `next` redirect param to prevent open redirects.
 * Returns a safe relative path or "/" as fallback.
 */
function validateRedirectPath(next: string | null, origin: string): string {
  if (!next) return "/";
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin) return "/";
    if (!url.pathname.startsWith("/")) return "/";
    // Block protocol-relative URLs like "//evil.com"
    if (next.startsWith("//")) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = validateRedirectPath(searchParams.get("next"), origin);
  const domain = getCookieDomain(request);

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                domain,
              })
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error - redirect to login
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
