import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase Auth + global route protection middleware.
 *
 * - Always refreshes auth cookies for SSR.
 * - Enforces: redirect to /login unless signed in (member or admin),
 *   with an allowlist for /login, /auth/*, and static assets.
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

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res;

  const pathname = req.nextUrl.pathname;
  const search = req.nextUrl.search ?? "";

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

  // Allowlist routes that do not require auth
  if (isPublicPath(pathname)) {
    return res;
  }

  // Global auth gating
  if (!user) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
