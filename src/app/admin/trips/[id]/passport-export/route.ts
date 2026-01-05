import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { decryptPassportNumber } from "@/app/lib/passportCrypto";

/**
 * Server-side route to get passport data for export.
 * This decrypts passport numbers and generates signed URLs for photos.
 * Only accessible to admins.
 */
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

    // Check admin status
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = (user.email ?? "").toLowerCase();
    if (!adminEmails.includes(email)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { memberIds } = await req.json();

    if (!Array.isArray(memberIds)) {
      return NextResponse.json({ error: "memberIds must be an array." }, { status: 400 });
    }

    // Fetch passport data for all member IDs
    const { data: passports, error: passportError } = await supabase
      .from("member_passports")
      .select("user_id,passport_full_name,passport_number_encrypted,passport_country,passport_expiry_date,passport_photo_path")
      .in("user_id", memberIds);

    if (passportError) {
      return NextResponse.json(
        { error: `Failed to fetch passports: ${passportError.message}` },
        { status: 500 }
      );
    }

    // Decrypt passport numbers and generate signed URLs for photos
    const passportData = await Promise.all(
      (passports || []).map(async (p) => {
        let decryptedNumber = null;
        if (p.passport_number_encrypted) {
          try {
            // Handle bytea data from PostgreSQL
            // Supabase returns bytea as Buffer or base64 string depending on driver
            let encryptedBase64: string;
            if (Buffer.isBuffer(p.passport_number_encrypted)) {
              encryptedBase64 = p.passport_number_encrypted.toString("base64");
            } else if (typeof p.passport_number_encrypted === "string") {
              // Might already be base64, or might be hex-encoded
              // Try to decode as hex first, otherwise assume base64
              try {
                const buffer = Buffer.from(p.passport_number_encrypted, "hex");
                encryptedBase64 = buffer.toString("base64");
              } catch {
                // Assume it's already base64
                encryptedBase64 = p.passport_number_encrypted;
              }
            } else {
              // Try to convert to buffer first
              const buffer = Buffer.from(p.passport_number_encrypted as any);
              encryptedBase64 = buffer.toString("base64");
            }
            decryptedNumber = decryptPassportNumber(encryptedBase64);
          } catch (err) {
            console.error(`Failed to decrypt passport for user ${p.user_id}`);
            // Continue with null if decryption fails
          }
        }

        let photoUrl = null;
        if (p.passport_photo_path) {
          try {
            // Extract relative path if full path includes bucket name
            let photoPath = p.passport_photo_path;
            if (photoPath.startsWith("passport-images/")) {
              photoPath = photoPath.replace("passport-images/", "");
            }

            // Generate signed URL for photo (24 hour expiry for export)
            const { data: signedUrlData } = await supabase.storage
              .from("passport-images")
              .createSignedUrl(photoPath, 86400); // 24 hours

            photoUrl = signedUrlData?.signedUrl || null;
          } catch (err) {
            console.error(`Failed to generate signed URL for photo ${p.passport_photo_path}:`, err);
            // Continue with null if URL generation fails
          }
        }

        return {
          user_id: p.user_id,
          passport_full_name: p.passport_full_name,
          passport_number: decryptedNumber,
          passport_country: p.passport_country,
          passport_expiry_date: p.passport_expiry_date,
          passport_photo_url: photoUrl,
        };
      })
    );

    // Log admin access (both decrypt_number and view_image if photo exists)
    for (const passport of passportData) {
      await supabase.from("passport_access_audit").insert({
        viewer_user_id: user.id,
        target_user_id: passport.user_id,
        action: "decrypt_number",
      });
      
      if (passport.passport_photo_url) {
        await supabase.from("passport_access_audit").insert({
          viewer_user_id: user.id,
          target_user_id: passport.user_id,
          action: "view_image",
        });
      }
    }

    return NextResponse.json({ passports: passportData });
  } catch (e: any) {
    console.error("Passport export error:", e);
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}

