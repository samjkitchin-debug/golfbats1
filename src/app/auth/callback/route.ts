import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Path-only redirect target; no full URLs. Prevents cross-domain redirects. */
function safeNextPath(next: string | null): string {
  if (!next) return "/";
  const t = next.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return "/";
  return t;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", origin));
  }

  const successUrl = new URL(next, origin);
  const res = NextResponse.redirect(successUrl);
  const redirectError = (msg: string) =>
    NextResponse.redirect(new URL(`/login?error=callback_failed&msg=${encodeURIComponent(msg)}`, origin));

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
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
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirectError(error.message);
    return res;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.redirect(
      new URL(`/login?error=callback_threw&msg=${encodeURIComponent(msg)}`, origin)
    );
  }
}
