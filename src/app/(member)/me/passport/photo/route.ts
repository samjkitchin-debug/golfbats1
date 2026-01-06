import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * GET /me/passport/photo
 * Returns a signed URL for the current member's passport photo, if any.
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const { data: passport, error: passportError } = await supabase
      .from("member_passports")
      .select("passport_photo_path")
      .eq("user_id", user.id)
      .maybeSingle();

    if (passportError) {
      return NextResponse.json(
        { error: `Failed to fetch passport: ${passportError.message}` },
        { status: 500 }
      );
    }

    if (!passport || !passport.passport_photo_path) {
      return NextResponse.json({ photoUrl: null });
    }

    let photoPath = passport.passport_photo_path as string;
    if (photoPath.startsWith("passport-images/")) {
      photoPath = photoPath.replace("passport-images/", "");
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("passport-images")
      .createSignedUrl(photoPath, 3600);

    if (signedUrlError) {
      console.error("Failed to generate signed URL for member passport photo:", signedUrlError);
      return NextResponse.json({ photoUrl: null });
    }

    return NextResponse.json({ photoUrl: signedUrlData?.signedUrl || null });
  } catch (e: any) {
    console.error("Member passport photo error:", e);
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}




