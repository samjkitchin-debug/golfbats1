import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase Auth + minimal route protection middleware.
 *
 * - Always refreshes auth cookies for SSR.
 * - Allows public paths: /login, /auth/*, /_next/*, static assets.
 * - Does NOT enforce onboarding or membership gates (handled by layouts).
 */

function isPublicPath(pathname: string) {
  // Public auth pages
  if (pathname === "/login") return true;
  if (pathname.startsWith("/auth/")) return true;

  // Next internals / static
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname === "/robots.txt") return true;
  if (pathname === "/sitemap.xml") return true;

  // Common static assets (including /logo.png)
  if (
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".map")
  ) {
    return true;
  }

  return false;
}

/**
 * Canonical host enforcement: redirect non-canonical hosts to dayforeit.sg
 */
function getCanonicalRedirect(req: NextRequest): NextResponse | null {
  const hostname = req.headers.get("host") || "";
  const canonicalHost = "dayforeit.sg";

  // Skip canonical enforcement for localhost and Vercel preview domains
  if (
    hostname === "localhost" ||
    hostname.startsWith("localhost:") ||
    hostname.endsWith(".vercel.app")
  ) {
    return null;
  }

  // Redirect non-canonical hosts to canonical host
  if (
    hostname === "www.dayforeit.sg" ||
    hostname === "golfbats.sg" ||
    hostname === "www.golfbats.sg"
  ) {
    const url = req.nextUrl.clone();
    // Construct canonical URL: preserve protocol, pathname, and search params
    const canonicalUrl = new URL(url.pathname + url.search, `${url.protocol}//${canonicalHost}`);
    return NextResponse.redirect(canonicalUrl, 301);
  }

  return null;
}

export async function middleware(req: NextRequest) {
  // Canonical host enforcement - must happen first
  const canonicalRedirect = getCanonicalRedirect(req);
  if (canonicalRedirect) {
    return canonicalRedirect;
  }

  const res = NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res;

  const pathname = req.nextUrl.pathname;

  // Set pathname header for use in server components (e.g., layout)
  res.headers.set("x-pathname", pathname);

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          res.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh session if needed (important for SSR).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Allow public paths
  if (isPublicPath(pathname)) {
    return res;
  }

  // All other paths: allow through
  // Onboarding/membership gates are handled by (member)/layout.tsx
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
