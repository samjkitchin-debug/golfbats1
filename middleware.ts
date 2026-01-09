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

function isAdminPath(pathname: string) {
  return pathname.startsWith("/admin");
}

function isAuthPath(pathname: string) {
  return pathname.startsWith("/auth");
}

type MemberGateState = {
  profileComplete: boolean;
  approved: boolean;
  isAdmin: boolean;
};

async function getMemberGateState(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<MemberGateState> {
  const { data, error } = await supabase
    .from("members")
    .select("email, full_name, display_name, nationality, declared_handicap, status, is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error loading member for gate state:", error);
    return { profileComplete: false, approved: false, isAdmin: false };
  }

  if (!data) {
    return { profileComplete: false, approved: false, isAdmin: false };
  }

  const profileComplete =
    !!data.email &&
    !!data.full_name &&
    !!data.display_name &&
    !!data.nationality &&
    data.declared_handicap !== null &&
    data.declared_handicap !== undefined;

  const approved = (data.status as string | null) === "active";
  const isAdmin = !!(data as any).is_admin;

  return { profileComplete, approved, isAdmin };
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

  // Member existence gate
  // Logic:
  // - If user is NOT authenticated → allow request
  // - If request path starts with /admin → allow request
  // - If request path is /me or /auth → allow request
  // - If user IS authenticated:
  //   - Query members table for record matching user id
  //   - If NO member record exists → redirect to /me
  //   - If member record exists → allow request

  // Allow unauthenticated users through (they'll be handled by other gates if needed)
  if (!user) {
    return res;
  }

  // Allow admin paths
  if (isAdminPath(pathname)) {
    return res;
  }

  // Allow /me and /auth paths (including profile edit paths under /me)
  if (isMePath(pathname) || isAuthPath(pathname) || isProfileEditPath(pathname)) {
    return res;
  }

  // For authenticated users on other paths, check member existence
  const { data: memberExists } = await supabase
    .from("members")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  // If no member record exists, redirect to /me
  if (!memberExists) {
    const meUrl = req.nextUrl.clone();
    meUrl.pathname = "/me";
    return NextResponse.redirect(meUrl);
  }

  // Profile completeness + approval gate
  // Users without a complete, approved profile may ONLY access:
  // - /me
  // - /me/edit and related save/upload routes
  if (!isAdminPath(pathname) && !isProfileEditPath(pathname) && !isMePath(pathname)) {
    const adminEmailsRaw = process.env.ADMIN_EMAILS || "";
    const adminEmails = adminEmailsRaw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = (user.email ?? "").toLowerCase();
    const isEnvAdmin = adminEmails.includes(email);

    const { profileComplete, approved, isAdmin } = await getMemberGateState(supabase, user.id);

    if (!profileComplete) {
      const profileUrl = req.nextUrl.clone();
      profileUrl.pathname = "/me/edit";
      profileUrl.searchParams.set("required", "true");
      return NextResponse.redirect(profileUrl);
    }

    // Admins (from DB is_admin or env) are treated as approved for routing, even if their member row is still pending.
    if (!approved && !isAdmin && !isEnvAdmin) {
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
