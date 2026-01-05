import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { encryptPassportNumber } from "@/app/lib/passportCrypto";

type Body = {
  passport_full_name?: unknown;
  passport_number?: unknown;
  passport_country?: unknown;
  passport_expiry_date?: unknown;
  passport_photo_path?: unknown;
};

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
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
    const passport_country = asTrimmedString(json.passport_country);
    const passport_expiry_date = asDateString(json.passport_expiry_date);
    const passport_photo_path =
      json.passport_photo_path && typeof json.passport_photo_path === "string"
        ? json.passport_photo_path.trim() || null
        : null;

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

    if (!passport_country) {
      return NextResponse.json(
        { error: "Passport country is required." },
        { status: 400 }
      );
    }

    if (!passport_expiry_date) {
      return NextResponse.json(
        { error: "Passport expiry date is required (YYYY-MM-DD format)." },
        { status: 400 }
      );
    }

    // Encrypt passport number (returns base64 string)
    let encrypted_number: string;
    try {
      encrypted_number = encryptPassportNumber(passport_number);
    } catch (encryptError: any) {
      console.error("Encryption error:", encryptError);
      return NextResponse.json(
        { error: "Failed to encrypt passport number." },
        { status: 500 }
      );
    }

    // Convert base64 string to Buffer for bytea column
    // Supabase JS client accepts Buffer for bytea columns
    const encryptedBuffer = Buffer.from(encrypted_number, "base64");

    // Check if passport already exists
    const { data: existing } = await supabase
      .from("member_passports")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      // Update existing passport
      const { error: updateError } = await supabase
        .from("member_passports")
        .update({
          passport_full_name,
          passport_number_encrypted: encryptedBuffer,
          passport_country,
          passport_expiry_date,
          passport_photo_path,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (updateError) {
        console.error("Update error:", updateError);
        return NextResponse.json(
          { error: `Failed to update passport: ${updateError.message}` },
          { status: 500 }
        );
      }
    } else {
      // Insert new passport
      const { error: insertError } = await supabase
        .from("member_passports")
        .insert({
          user_id: user.id,
          passport_full_name,
          passport_number_encrypted: encryptedBuffer,
          passport_country,
          passport_expiry_date,
          passport_photo_path,
        });

      if (insertError) {
        console.error("Insert error:", insertError);
        return NextResponse.json(
          { error: `Failed to save passport: ${insertError.message}` },
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

