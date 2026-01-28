import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";
import { isEmailAdmin } from "@/app/lib/auth";
import { isGroupAdmin } from "@/app/lib/serverAuth";
import { decryptPassportNumber } from "@/app/lib/passportCrypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/trips/[id]/passport/export
 * Export all confirmed attendees' passport details as CSV (group admin/organiser only)
 * 
 * Authorization:
 * - Requester must be group admin/organiser for the trip's group
 * 
 * Returns CSV with:
 * - Name, Nationality, Passport Full Name, Passport Number (decrypted), Passport Country, Passport Expiry, Passport Photo URL
 * Note: passport_date_of_birth is NOT stored in v1 schema and is NOT included in export
 * All access is audited.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tripIdParam } = await params;
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
      .select("id,group_id,name")
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

    // Verify requester is group admin/organiser
    const isPlatformAdmin = isEmailAdmin(user.email);
    const userIsGroupAdmin = await isGroupAdmin({
      supabase,
      userId: user.id,
      groupId,
    });

    if (!isPlatformAdmin && !userIsGroupAdmin) {
      return NextResponse.json(
        { error: "You must be a group admin to export passport details." },
        { status: 403 }
      );
    }

    // Fetch confirmed attendees
    const { data: attendeesData, error: attendeesError } = await supabaseService
      .from("trip_attendees")
      .select("member_id")
      .eq("trip_id", tripId)
      .eq("status", "confirmed");

    if (attendeesError) {
      console.error("[passport export] Failed to fetch attendees:", attendeesError);
      return NextResponse.json(
        { error: "Failed to fetch attendees." },
        { status: 500 }
      );
    }

    if (!attendeesData || attendeesData.length === 0) {
      return NextResponse.json(
        { error: "No confirmed attendees found." },
        { status: 404 }
      );
    }

    const memberIds = attendeesData.map(a => a.member_id);

    // Fetch member names and nationalities
    const { data: membersData, error: membersError } = await supabaseService
      .from("members")
      .select("id,display_name,full_name,nationality")
      .in("id", memberIds);

    if (membersError) {
      console.error("[passport export] Failed to fetch members:", membersError);
      return NextResponse.json(
        { error: "Failed to fetch member data." },
        { status: 500 }
      );
    }

    const membersById = new Map(
      (membersData || []).map(m => [m.id, {
        name: m.display_name || m.full_name || "Unknown",
        nationality: m.nationality || "",
      }])
    );

    // Fetch passport data for all attendees
    const { data: passportsData, error: passportsError } = await supabaseService
      .from("member_passports")
      .select("user_id,passport_full_name,passport_number_encrypted,passport_country,passport_expiry_date,passport_photo_path")
      .in("user_id", memberIds);

    if (passportsError) {
      console.error("[passport export] Failed to fetch passports:", passportsError);
      return NextResponse.json(
        { error: "Failed to fetch passport data." },
        { status: 500 }
      );
    }

    const passportsByUserId = new Map(
      (passportsData || []).map(p => [p.user_id, p])
    );

    // Build CSV rows
    const csvRows: string[] = [];
    
    // CSV header
    csvRows.push("Name,Nationality,Passport Full Name,Passport Number,Passport Country,Passport Expiry,Passport Photo URL");

    // Process each attendee
    for (const memberId of memberIds) {
      const member = membersById.get(memberId);
      const passport = passportsByUserId.get(memberId);

      if (!member) continue;

      const name = member.name;
      const nationality = member.nationality;
      const passportFullName = passport?.passport_full_name || "";
      const passportCountry = passport?.passport_country || "";
      const passportExpiry = passport?.passport_expiry_date || "";

      // Decrypt passport number
      let passportNumber = "";
      if (passport?.passport_number_encrypted) {
        try {
          // Convert bytea to base64 string for decryption
          const encrypted = passport.passport_number_encrypted;
          let encryptedBase64: string;
          
          if (Buffer.isBuffer(encrypted)) {
            encryptedBase64 = encrypted.toString("base64");
          } else if (encrypted instanceof Uint8Array) {
            encryptedBase64 = Buffer.from(encrypted).toString("base64");
          } else if (typeof encrypted === "string") {
            encryptedBase64 = encrypted;
          } else {
            encryptedBase64 = Buffer.from(encrypted as any).toString("base64");
          }
          
          passportNumber = decryptPassportNumber(encryptedBase64);
        } catch (decryptError: any) {
          console.error(`[passport export] Decryption error for ${memberId}:`, decryptError);
          passportNumber = "[DECRYPTION_ERROR]";
        }
      }

      // Generate signed photo URL
      let photoUrl = "";
      if (passport?.passport_photo_path) {
        try {
          let photoPath = passport.passport_photo_path as string;
          if (photoPath.startsWith("passport-images/")) {
            photoPath = photoPath.replace("passport-images/", "");
          }

          const { data: signedUrlData, error: signedUrlError } = await supabaseService.storage
            .from("passport-images")
            .createSignedUrl(photoPath, 3600); // 1 hour expiry

          if (!signedUrlError && signedUrlData) {
            photoUrl = signedUrlData.signedUrl;
          }
        } catch (urlError: any) {
          console.error(`[passport export] Signed URL error for ${memberId}:`, urlError);
        }
      }

      // Escape CSV values (handle commas and quotes)
      const escapeCsv = (value: string): string => {
        if (value.includes(",") || value.includes('"') || value.includes("\n")) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      };

      csvRows.push([
        escapeCsv(name),
        escapeCsv(nationality),
        escapeCsv(passportFullName),
        escapeCsv(passportNumber),
        escapeCsv(passportCountry),
        escapeCsv(passportExpiry),
        escapeCsv(photoUrl),
      ].join(","));
    }

    // Audit export action for each attendee (fail if any audit write fails)
    for (const memberId of memberIds) {
      const { error: auditError } = await supabaseService.from("passport_access_audit").insert({
        viewer_user_id: user.id,
        target_user_id: memberId,
        action: "export_csv",
      });
      
      if (auditError) {
        console.error(`[passport export] Audit insert failed for ${memberId}:`, auditError);
        return NextResponse.json(
          { error: "Failed to audit passport export access." },
          { status: 500 }
        );
      }
    }

    const csvContent = csvRows.join("\n");

    // Return CSV with appropriate headers
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="trip-${tripData.name || tripId}-passport-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Passport export error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
