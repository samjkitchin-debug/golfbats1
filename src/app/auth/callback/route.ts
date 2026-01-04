import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabaseServer";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL(`/login?error=missing_code`, origin));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        new URL(
          `/login?error=callback_failed&msg=${encodeURIComponent(error.message)}`,
          origin
        )
      );
    }

    return NextResponse.redirect(new URL(next, origin));
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(
        `/login?error=callback_threw&msg=${encodeURIComponent(e?.message ?? "unknown")}`,
        origin
      )
    );
  }
}
