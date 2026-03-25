import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/login", "/signup", "/callback", "/onboarding", "/developers"];

function getCookieDomain(request: NextRequest): string | undefined {
  const cookieDomain = process.env.COOKIE_DOMAIN;
  if (cookieDomain) return cookieDomain;
  const host = request.headers.get("host") ?? "";
  if (host.endsWith(".kinetiks.ai")) return ".kinetiks.ai";
  return undefined;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth redirects for API routes - let API handlers manage their own auth
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const domain = getCookieDomain(request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, {
              ...options,
              domain,
            })
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Not authenticated and trying to access protected route
  if (!user && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated and on auth page - redirect to dashboard
  if (user && isPublicRoute && pathname !== "/callback") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
