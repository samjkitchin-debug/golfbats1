import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabaseServer";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;

  const next = url.searchParams.get("next") ?? "/";
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const msg = encodeURIComponent(error.message);
      return NextResponse.redirect(`${origin}/login?error=callback_failed&msg=${msg}`);
    }

    return NextResponse.redirect(`${origin}${next}`);
  } catch (e: any) {
    const msg = encodeURIComponent(e?.message || "unknown");
    return NextResponse.redirect(`${origin}/login?error=callback_threw&msg=${msg}`);
  }
}
