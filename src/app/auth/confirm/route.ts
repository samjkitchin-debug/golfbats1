import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabaseServer";

type EmailOtpType = "magiclink" | "email" | "recovery" | "invite";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;

  const next = url.searchParams.get("next") ?? "/";
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/login?error=missing_token_hash`);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });

    if (error) {
      const msg = encodeURIComponent(error.message);
      return NextResponse.redirect(`${origin}/login?error=otp_verify_failed&msg=${msg}`);
    }

    return NextResponse.redirect(`${origin}${next}`);
  } catch (e: any) {
    const msg = encodeURIComponent(e?.message || "unknown");
    return NextResponse.redirect(`${origin}/login?error=otp_verify_threw&msg=${msg}`);
  }
}
