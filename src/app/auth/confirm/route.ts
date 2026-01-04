import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabaseServer";

type EmailOtpType = "magiclink" | "email" | "recovery" | "invite";

function safeNextPath(next: string | null) {
  // Only allow internal relative paths. Anything else -> "/"
  if (!next) return "/";
  const trimmed = next.trim();
  if (!trimmed.startsWith("/")) return "/";
  if (trimmed.startsWith("//")) return "/";
  return trimmed;
}

function isValidType(v: string | null): v is EmailOtpType {
  return v === "magiclink" || v === "email" || v === "recovery" || v === "invite";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;

  const next = safeNextPath(url.searchParams.get("next"));
  const token_hash = url.searchParams.get("token_hash");
  const typeParam = url.searchParams.get("type");

  if (!token_hash) {
    return NextResponse.redirect(new URL(`/login?error=missing_token_hash`, origin));
  }

  if (!isValidType(typeParam)) {
    return NextResponse.redirect(new URL(`/login?error=invalid_otp_type`, origin));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: typeParam });

    if (error) {
      const msg = encodeURIComponent(error.message);
      return NextResponse.redirect(new URL(`/login?error=otp_verify_failed&msg=${msg}`, origin));
    }

    return NextResponse.redirect(new URL(next, origin));
  } catch (e: any) {
    const msg = encodeURIComponent(e?.message || "unknown");
    return NextResponse.redirect(new URL(`/login?error=otp_verify_threw&msg=${msg}`, origin));
  }
}
