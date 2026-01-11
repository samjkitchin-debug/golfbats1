import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { decryptPassportNumber } from "@/app/lib/passportCrypto";
import { isEmailAdmin } from "@/app/lib/auth";

/**
 * Server-side route to get passport data for export.
 * This decrypts passport numbers and generates signed URLs for photos.
 * Only accessible to group admins.
 * NOTE: This route is now group-scoped via the layout, but we still validate admin access here.
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

    // Platform admin: only via isEmailAdmin (members.is_admin removed from authorization checks)
    const isPlatformAdmin = isEmailAdmin(user.email);

    // Get groupId from URL path: /admin/{groupId}/trips/{id}/passport-export
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const adminIndex = pathParts.indexOf("admin");
    const groupId = adminIndex >= 0 && adminIndex + 1 < pathParts.length
      ? pathParts[adminIndex + 1]
      : null;

    if (!groupId) {
      return NextResponse.json(
        { error: "Group ID not found in URL path." },
        { status: 400 }
      );
    }

    // Verify group exists and user has admin access
    const { data: group } = await supabase
      .from("groups")
      .select("id")
      .eq("id", groupId)
      .eq("is_active", true)
      .single();

    if (!group) {
      return NextResponse.json(
        { error: "Group not found or inactive." },
        { status: 404 }
      );
    }

    // Check group admin authorization
    const { data: groupMember } = await supabase
      .from("group_members")
      .select("role, status")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    const isGroupAdmin =
      isPlatformAdmin ||
      (groupMember && groupMember.role === "admin" && groupMember.status === "approved");

    if (!isGroupAdmin) {
      return NextResponse.json(
        { error: "You must be an approved admin of this group to export passport data." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const memberIds = body.memberIds as string[] | undefined;

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
