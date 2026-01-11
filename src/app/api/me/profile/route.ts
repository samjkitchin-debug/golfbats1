import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

type Body = {
  passport_full_name?: unknown;
  passport_number?: unknown;
  passport_nationality?: unknown;
  passport_date_of_birth?: unknown;
  passport_expiry_date?: unknown;
};

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asDateString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  // Basic date validation (YYYY-MM-DD format)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const json = (await req.json()) as Body;

    const passport_full_name = asTrimmedString(json.passport_full_name);
    const passport_number = asTrimmedString(json.passport_number);
    const passport_nationality = asTrimmedString(json.passport_nationality);
    const passport_date_of_birth = asDateString(json.passport_date_of_birth);
    const passport_expiry_date = asDateString(json.passport_expiry_date);

    // Validate required fields
    if (!passport_full_name) {
      return NextResponse.json(
        { error: "Passport full name is required." },
        { status: 400 }
      );
    }

    if (!passport_number) {
      return NextResponse.json(
        { error: "Passport number is required." },
        { status: 400 }
      );
    }

    if (!passport_nationality) {
      return NextResponse.json(
        { error: "Passport nationality is required." },
        { status: 400 }
      );
    }

    if (!passport_date_of_birth) {
      return NextResponse.json(
        { error: "Passport date of birth is required (YYYY-MM-DD format)." },
        { status: 400 }
      );
    }

    if (!passport_expiry_date) {
      return NextResponse.json(
        { error: "Passport expiry date is required (YYYY-MM-DD format)." },
        { status: 400 }
      );
    }

    // Check if profile already exists in member_profiles
    const { data: existing } = await supabase
      .from("member_profiles")
      .select("member_id")
      .eq("member_id", user.id)
      .maybeSingle();

    if (existing) {
      // Update existing profile
      const { error: updateError } = await supabase
        .from("member_profiles")
        .update({
          passport_full_name,
          passport_number,
          passport_nationality,
          passport_date_of_birth,
          passport_expiry_date,
          updated_at: new Date().toISOString(),
        })
        .eq("member_id", user.id);

      if (updateError) {
        console.error("Update error:", updateError);
        console.error("Error details:", JSON.stringify(updateError, null, 2));
        return NextResponse.json(
          { error: `Failed to update passport: ${updateError.message || JSON.stringify(updateError)}` },
          { status: 500 }
        );
      }
    } else {
      // Insert new profile
      const { error: insertError } = await supabase
        .from("member_profiles")
        .insert({
          member_id: user.id,
          passport_full_name,
          passport_number,
          passport_nationality,
          passport_date_of_birth,
          passport_expiry_date,
        });

      if (insertError) {
        console.error("Insert error:", insertError);
        console.error("Error details:", JSON.stringify(insertError, null, 2));
        return NextResponse.json(
          { error: `Failed to save passport: ${insertError.message || JSON.stringify(insertError)}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Save error:", e);
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
