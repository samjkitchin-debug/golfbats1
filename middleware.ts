import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase Auth + minimal route protection middleware.
 *
 * - Always refreshes auth cookies for SSR.
 * - Explicitly allow (no auth redirect): /login, /auth/callback, /auth/*, /_next/*, static assets.
 *   OAuth callback must complete session persistence; do not block these.
 * - Does NOT enforce onboarding or membership gates (handled by layouts).
 */

function isPublicPath(pathname: string) {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/auth/")) return true; /* /auth/callback, /auth/confirm, etc. */

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

const CANONICAL_HOST = "dayforeit.sg";

/**
 * Reject wrong host: dayforeit.com / www.dayforeit.com → 308 to dayforeit.sg.
 * Prod only (skip localhost, Vercel previews, dev subdomain). Never redirect auth paths.
 */
function getWrongHostRedirect(req: NextRequest): NextResponse | null {
  const pathname = req.nextUrl.pathname;
  if (pathname === "/login" || pathname.startsWith("/auth/")) return null;

  const hostname = req.headers.get("host") || "";
  if (
    hostname === "localhost" ||
    hostname.startsWith("localhost:") ||
    hostname.endsWith(".vercel.app") ||
    hostname === "dev.dayforeit.sg" ||
    hostname.startsWith("dev.dayforeit.sg:")
  ) {
    return null;
  }

  if (hostname === "dayforeit.com" || hostname === "www.dayforeit.com") {
    const url = req.nextUrl.clone();
    const target = new URL(url.pathname + url.search, `https://${CANONICAL_HOST}`);
    return NextResponse.redirect(target, 308);
  }
  return null;
}

/**
 * Canonical host enforcement: redirect non-canonical hosts to dayforeit.sg.
 * Never redirect to .com. Never redirect auth endpoints.
 */
function getCanonicalRedirect(req: NextRequest): NextResponse | null {
  const pathname = req.nextUrl.pathname;
  if (pathname === "/login" || pathname.startsWith("/auth/")) return null;

  const hostname = req.headers.get("host") || "";
  if (
    hostname === "localhost" ||
    hostname.startsWith("localhost:") ||
    hostname.endsWith(".vercel.app")
  ) {
    return null;
  }

  if (
    hostname === "www.dayforeit.sg" ||
    hostname === "golfbats.sg" ||
    hostname === "www.golfbats.sg"
  ) {
    const url = req.nextUrl.clone();
    const canonicalUrl = new URL(url.pathname + url.search, `${url.protocol}//${CANONICAL_HOST}`);
    return NextResponse.redirect(canonicalUrl, 307);
  }
  return null;
}

export async function middleware(req: NextRequest) {
  // Reject .com first: dayforeit.com / www → 308 to dayforeit.sg (prod only; auth skipped)
  const wrongHost = getWrongHostRedirect(req);
  if (wrongHost) return wrongHost;

  const canonicalRedirect = getCanonicalRedirect(req);
  if (canonicalRedirect) return canonicalRedirect;

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
