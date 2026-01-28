import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";
import { isEmailAdmin } from "@/app/lib/auth";
import { isGroupAdmin } from "@/app/lib/serverAuth";
import { decryptPassportNumber } from "@/app/lib/passportCrypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/trips/[id]/passport/[memberId]
 * Fetch passport details for a trip attendee (group admin/organiser only)
 * 
 * Authorization:
 * - Requester must be group admin/organiser for the trip's group
 * - Target member must be an attendee of that trip
 * 
 * Returns decrypted passport data with signed photo URL.
 * All access is audited.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: tripIdParam, memberId: targetMemberId } = await params;
    const supabase = await createSupabaseServerClient();
    const supabaseService = await createSupabaseServiceClient();
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse trip ID (could be numeric legacy_id or UUID)
    const parsedNumericId = parseInt(tripIdParam, 10);
    const isNumeric = !isNaN(parsedNumericId);

    // Find trip by legacy_id or id (UUID)
    let tripQuery = supabase
      .from("trips")
      .select("id,group_id")
      .limit(1);

    if (isNumeric) {
      tripQuery = tripQuery.eq("legacy_id", parsedNumericId);
    } else {
      tripQuery = tripQuery.eq("id", tripIdParam);
    }

    const { data: tripData, error: tripError } = await tripQuery.single();

    if (tripError || !tripData) {
      return NextResponse.json(
        { error: "Trip not found." },
        { status: 404 }
      );
    }

    const tripId = tripData.id;
    const groupId = tripData.group_id;

    // Verify target member is an attendee of this trip
    const { data: attendeeData, error: attendeeError } = await supabaseService
      .from("trip_attendees")
      .select("member_id")
      .eq("trip_id", tripId)
      .eq("member_id", targetMemberId)
      .maybeSingle();

    if (attendeeError || !attendeeData) {
      return NextResponse.json(
        { error: "Member is not an attendee of this trip." },
        { status: 403 }
      );
    }

    // Verify requester is group admin/organiser
    const isPlatformAdmin = isEmailAdmin(user.email);
    const userIsGroupAdmin = await isGroupAdmin({
      supabase,
      userId: user.id,
      groupId,
    });

    if (!isPlatformAdmin && !userIsGroupAdmin) {
      return NextResponse.json(
        { error: "You must be a group admin to view passport details." },
        { status: 403 }
      );
    }

    // Fetch passport data using service role client
    const { data: passportData, error: passportError } = await supabaseService
      .from("member_passports")
      .select("passport_full_name,passport_number_encrypted,passport_country,passport_expiry_date,passport_photo_path")
      .eq("user_id", targetMemberId)
      .maybeSingle();

    if (passportError) {
      console.error("[passport API] Failed to fetch passport:", passportError);
      return NextResponse.json(
        { error: "Failed to fetch passport data." },
        { status: 500 }
      );
    }

    if (!passportData) {
      return NextResponse.json(
        { error: "Passport data not found for this member." },
        { status: 404 }
      );
    }

    // Decrypt passport number (server-side only)
    let decryptedNumber: string | null = null;
    if (passportData.passport_number_encrypted) {
      try {
        // Convert bytea to base64 string for decryption
        // Handle different return types from Supabase (Buffer, Uint8Array, or base64 string)
        let encryptedBase64: string;
        const encrypted = passportData.passport_number_encrypted;
        
        if (Buffer.isBuffer(encrypted)) {
          encryptedBase64 = encrypted.toString("base64");
        } else if (encrypted instanceof Uint8Array) {
          encryptedBase64 = Buffer.from(encrypted).toString("base64");
        } else if (typeof encrypted === "string") {
          // Already base64 string
          encryptedBase64 = encrypted;
        } else {
          // Try to convert to Buffer first
          encryptedBase64 = Buffer.from(encrypted as any).toString("base64");
        }
        
        decryptedNumber = decryptPassportNumber(encryptedBase64);
        
        // Audit decrypt action (fail if audit write fails)
        const { error: decryptAuditError } = await supabaseService.from("passport_access_audit").insert({
          viewer_user_id: user.id,
          target_user_id: targetMemberId,
          action: "decrypt_number",
        });
        
        if (decryptAuditError) {
          console.error("[passport API] Audit insert failed for decrypt_number:", decryptAuditError);
          return NextResponse.json(
            { error: "Failed to audit passport access." },
            { status: 500 }
          );
        }
      } catch (decryptError: any) {
        console.error("[passport API] Decryption error:", decryptError);
        // Don't fail the request, just return null for passport number
      }
    }

    // Generate signed photo URL if photo exists
    let photoUrl: string | null = null;
    if (passportData.passport_photo_path) {
      let photoPath = passportData.passport_photo_path as string;
      if (photoPath.startsWith("passport-images/")) {
        photoPath = photoPath.replace("passport-images/", "");
      }

      const { data: signedUrlData, error: signedUrlError } = await supabaseService.storage
        .from("passport-images")
        .createSignedUrl(photoPath, 3600); // 1 hour expiry

      if (!signedUrlError && signedUrlData) {
        photoUrl = signedUrlData.signedUrl;
        
        // Audit view_image action (fail if audit write fails)
        const { error: imageAuditError } = await supabaseService.from("passport_access_audit").insert({
          viewer_user_id: user.id,
          target_user_id: targetMemberId,
          action: "view_image",
        });
        
        if (imageAuditError) {
          console.error("[passport API] Audit insert failed for view_image:", imageAuditError);
          return NextResponse.json(
            { error: "Failed to audit passport access." },
            { status: 500 }
          );
        }
      }
    }

    // Audit view_text action (viewing passport details) - fail if audit write fails
    const { error: viewTextAuditError } = await supabaseService.from("passport_access_audit").insert({
      viewer_user_id: user.id,
      target_user_id: targetMemberId,
      action: "view_text",
    });

    if (viewTextAuditError) {
      console.error("[passport API] Audit insert failed for view_text:", viewTextAuditError);
      return NextResponse.json(
        { error: "Failed to audit passport access." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      passportFullName: passportData.passport_full_name,
      passportNumber: decryptedNumber,
      passportCountry: passportData.passport_country,
      passportExpiryDate: passportData.passport_expiry_date,
      passportPhotoUrl: photoUrl,
    });
  } catch (error) {
    console.error("Get passport error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
