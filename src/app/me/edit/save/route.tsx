import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabaseServer";

function cleanText(v: FormDataEntryValue | null, maxLen: number) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  return s.slice(0, maxLen);
}

function parseHandicap(v: FormDataEntryValue | null) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 54) return null;

  return Math.round(n * 10) / 10;
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/me/edit", req.url));
  }

  const form = await req.formData();

  const display_name = cleanText(form.get("display_name"), 60);
  const nationality = cleanText(form.get("nationality"), 60);
  const declared_handicap = parseHandicap(form.get("declared_handicap"));

  const { error } = await supabase
    .from("members")
    .update({
      display_name,
      nationality,
      declared_handicap,
      last_seen: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    await supabase
      .from("members")
      .upsert(
        {
          id: user.id,
          email: user.email ?? "",
          display_name,
          nationality,
          declared_handicap,
          last_seen: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
  }

  return NextResponse.redirect(new URL("/me", req.url));
}
