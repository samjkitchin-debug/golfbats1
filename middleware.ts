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

function isProfileEditPath(pathname: string) {
  // Allow access to profile editing pages without profile/approval check
  return (
    pathname === "/me/edit" ||
    pathname === "/me/edit/save" ||
    pathname.startsWith("/me/profile-photo") ||
    pathname.startsWith("/me/passport")
  );
}

function isMePath(pathname: string) {
  return pathname === "/me";
}

type MemberGateState = {
  profileComplete: boolean;
  approved: boolean;
};

async function getMemberGateState(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<MemberGateState> {
  const { data, error } = await supabase
    .from("members")
    .select("email, full_name, display_name, nationality, declared_handicap, status")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error loading member for gate state:", error);
    return { profileComplete: false, approved: false };
  }

  if (!data) {
    return { profileComplete: false, approved: false };
  }

  const profileComplete =
    !!data.email &&
    !!data.full_name &&
    !!data.display_name &&
    !!data.nationality &&
    data.declared_handicap !== null &&
    data.declared_handicap !== undefined;

  const approved = (data.status as string | null) === "active";

  return { profileComplete, approved };
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

  // Profile completeness + approval gate
  // Users without a complete, approved profile may ONLY access:
  // - /me
  // - /me/edit and related save/upload routes
  if (!isProfileEditPath(pathname) && !isMePath(pathname)) {
    const { profileComplete, approved } = await getMemberGateState(supabase, user.id);

    if (!profileComplete) {
      const profileUrl = req.nextUrl.clone();
      profileUrl.pathname = "/me/edit";
      profileUrl.searchParams.set("required", "true");
      return NextResponse.redirect(profileUrl);
    }

    if (!approved) {
      const meUrl = req.nextUrl.clone();
      meUrl.pathname = "/me";
      meUrl.searchParams.set("pending", "true");
      return NextResponse.redirect(meUrl);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
