import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { decryptPassportNumber } from "@/app/lib/passportCrypto";

/**
 * Server-side route to get passport details for a member.
 * Decrypts passport number and generates signed URL for photo.
 * Only accessible to admins.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    // Check admin status
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = (user.email ?? "").toLowerCase();
    if (!adminEmails.includes(email)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const memberId = params.id;

    // Fetch passport data
    const { data: passport, error: passportError } = await supabase
      .from("member_passports")
      .select("passport_full_name,passport_number_encrypted,passport_country,passport_expiry_date,passport_photo_path")
      .eq("user_id", memberId)
      .maybeSingle();

    if (passportError) {
      return NextResponse.json(
        { error: `Failed to fetch passport: ${passportError.message}` },
        { status: 500 }
      );
    }

    if (!passport) {
      return NextResponse.json({ passport: null });
    }

    // Decrypt passport number
    let decryptedNumber = null;
    if (passport.passport_number_encrypted) {
      try {
        // Handle bytea data from PostgreSQL
        let encryptedBase64: string;
        if (Buffer.isBuffer(passport.passport_number_encrypted)) {
          encryptedBase64 = passport.passport_number_encrypted.toString("base64");
        } else if (typeof passport.passport_number_encrypted === "string") {
          try {
            const buffer = Buffer.from(passport.passport_number_encrypted, "hex");
            encryptedBase64 = buffer.toString("base64");
          } catch {
            encryptedBase64 = passport.passport_number_encrypted;
          }
        } else {
          const buffer = Buffer.from(passport.passport_number_encrypted as any);
          encryptedBase64 = buffer.toString("base64");
        }
        decryptedNumber = decryptPassportNumber(encryptedBase64);
      } catch (err) {
        console.error(`Failed to decrypt passport for user ${memberId}`);
      }
    }

    // Generate signed URL for photo (1 hour expiry)
    let photoUrl = null;
    if (passport.passport_photo_path) {
      try {
        // Stored values look like "passport-images/{user_id}/{file}.jpg"
        // Storage bucket key should be "{user_id}/{file}.jpg"
        let photoPath = passport.passport_photo_path;
        if (photoPath.startsWith("passport-images/")) {
          photoPath = photoPath.replace("passport-images/", "");
        }

        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from("passport-images")
          .createSignedUrl(photoPath, 3600); // 1 hour

        if (signedUrlError) {
          console.error("Failed to generate signed URL for photo:", signedUrlError);
        }

        photoUrl = signedUrlData?.signedUrl || null;
      } catch (err) {
        console.error(`Failed to generate signed URL for photo:`, err);
      }
    }

    // Log admin access
    await supabase.from("passport_access_audit").insert({
      viewer_user_id: user.id,
      target_user_id: memberId,
      action: "decrypt_number",
    });

    if (photoUrl) {
      await supabase.from("passport_access_audit").insert({
        viewer_user_id: user.id,
        target_user_id: memberId,
        action: "view_image",
      });
    }

    return NextResponse.json({
      passport: {
        passport_full_name: passport.passport_full_name,
        passport_number: decryptedNumber,
        passport_country: passport.passport_country,
        passport_expiry_date: passport.passport_expiry_date,
        passport_photo_url: photoUrl,
      },
    });
  } catch (e: any) {
    console.error("Passport fetch error:", e);
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}

