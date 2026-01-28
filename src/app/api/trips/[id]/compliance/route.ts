import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";

export const dynamic = "force-dynamic";

/**
 * GET /api/trips/[id]/compliance
 * Returns compliance exception data for trip organisers (host/admin only)
 * 
 * Returns only members with missing fields (exception-only).
 * Never returns raw passport values, only missing field names.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    // Get current member ID
    let currentMemberId: string | null = null;
    const { data: memberData } = await supabase
      .from("members")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    currentMemberId = memberData?.id || null;

    if (!currentMemberId) {
      return NextResponse.json({ error: "Member not found" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }

    // Parse id - could be numeric legacy_id or UUID
    const parsedNumericId = parseInt(id, 10);
    const isNumeric = !isNaN(parsedNumericId);

    // Find trip by legacy_id or id (UUID)
    let tripQuery = supabase
      .from("trips")
      .select("id,legacy_id,group_id,created_by_member_id,trip_origin,logistics")
      .eq(isNumeric ? "legacy_id" : "id", isNumeric ? parsedNumericId : id);

    const { data: tripData, error: tripError } = await tripQuery.single();

    if (tripError || !tripData) {
      return NextResponse.json(
        { error: "Trip not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const tripId = tripData.id;
    const groupId = tripData.group_id;
    const createdByMemberId = (tripData as any).created_by_member_id;
    const tripOrigin = (tripData as any).trip_origin || 'group';

    // Check if user is host or admin
    const isHost = createdByMemberId === currentMemberId;
    
    // Check if user is group admin (for group trips)
    let isGroupAdmin = false;
    if (tripOrigin === 'group' && groupId) {
      const { data: membershipData } = await supabase
        .from("group_members")
        .select("role, status")
        .eq("group_id", groupId)
        .eq("user_id", currentMemberId)
        .maybeSingle();
      
      isGroupAdmin = membershipData?.role === 'admin' && membershipData?.status === 'approved';
    }

    // Gate: only host or admin can access compliance data
    if (!isHost && !isGroupAdmin) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Check if travel docs are required
    const logistics = (tripData as any).logistics;
    const travelDocsRequired = logistics?.travelDocsRequired ?? false;

    // If travel docs not required, return empty missing list
    if (!travelDocsRequired) {
      const { data: attendeesData } = await supabase
        .from("trip_attendees")
        .select("trip_id,member_id,status")
        .eq("trip_id", tripId)
        .eq("status", "confirmed");
      
      const total = attendeesData?.length || 0;
      
      // Generate numeric ID
      let numericTripId: number;
      if (tripData.legacy_id) {
        numericTripId = tripData.legacy_id;
      } else {
        const uuid = tripData.id;
        let hash = 0;
        for (let i = 0; i < uuid.length; i++) {
          const char = uuid.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        numericTripId = Math.abs(hash) % 1000000 + 1000000;
      }

      return NextResponse.json({
        tripId: numericTripId,
        required: false,
        summary: {
          total,
          complete: total,
          missing: 0,
        },
        missing: [],
      }, { headers: { "Cache-Control": "no-store" } });
    }

    // Fetch confirmed attendees
    const { data: attendeesData, error: attendeesError } = await supabase
      .from("trip_attendees")
      .select("trip_id,member_id,status")
      .eq("trip_id", tripId)
      .eq("status", "confirmed");

    if (attendeesError) {
      console.error("[trips/[id]/compliance] Failed to fetch attendees:", attendeesError);
      return NextResponse.json(
        { error: "Failed to fetch attendees" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const attendees = attendeesData || [];
    const memberIds = Array.from(new Set(attendees.map((a: any) => a.member_id).filter(Boolean)));

    if (memberIds.length === 0) {
      // Generate numeric ID
      let numericTripId: number;
      if (tripData.legacy_id) {
        numericTripId = tripData.legacy_id;
      } else {
        const uuid = tripData.id;
        let hash = 0;
        for (let i = 0; i < uuid.length; i++) {
          const char = uuid.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        numericTripId = Math.abs(hash) % 1000000 + 1000000;
      }

      return NextResponse.json({
        tripId: numericTripId,
        required: true,
        summary: {
          total: 0,
          complete: 0,
          missing: 0,
        },
        missing: [],
      }, { headers: { "Cache-Control": "no-store" } });
    }

    // Use service client to fetch passport data (bypasses RLS)
    const supabaseService = await createSupabaseServiceClient();

    // Fetch member display names
    const { data: membersData, error: membersError } = await supabaseService
      .from("members")
      .select("id,display_name,full_name")
      .in("id", memberIds);

    if (membersError) {
      console.error("[trips/[id]/compliance] Failed to fetch members:", membersError);
      return NextResponse.json(
        { error: "Failed to fetch member data" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const membersById: Record<string, { display_name: string | null; full_name: string | null }> = {};
    if (membersData) {
      for (const m of membersData) {
        membersById[m.id] = {
          display_name: m.display_name,
          full_name: m.full_name,
        };
      }
    }

    // Fetch passport data from member_passports (canonical source)
    const { data: passportsData, error: passportsError } = await supabaseService
      .from("member_passports")
      .select("user_id,passport_full_name,passport_number_encrypted,passport_country,passport_expiry_date")
      .in("user_id", memberIds);

    if (passportsError) {
      console.error("[trips/[id]/compliance] Failed to fetch passports:", passportsError);
      return NextResponse.json(
        { error: "Failed to fetch passport data" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const passportsByUserId: Record<string, {
      passport_full_name: string | null;
      passport_number_encrypted: boolean;
      passport_country: string | null;
      passport_expiry_date: string | null;
    }> = {};

    if (passportsData) {
      for (const p of passportsData) {
        passportsByUserId[p.user_id] = {
          passport_full_name: p.passport_full_name ?? null,
          passport_number_encrypted: !!p.passport_number_encrypted,
          passport_country: p.passport_country ?? null,
          passport_expiry_date: p.passport_expiry_date ?? null,
        };
      }
    }

    // Compute compliance for each attendee
    const missing: Array<{ memberId: string; displayName: string; missingFields: string[] }> = [];
    let completeCount = 0;

    for (const attendee of attendees) {
      const memberId = attendee.member_id;
      if (!memberId) continue;

      const member = membersById[memberId] || {};
      const passport = passportsByUserId[memberId] || null;
      const displayName = member.display_name || member.full_name || "Unknown";

      // Compute missing fields (never return raw passport values)
      const missingFields: string[] = [];
      if (!passport?.passport_full_name) missingFields.push("passport_full_name");
      if (!passport?.passport_number_encrypted) missingFields.push("passport_number");
      if (!passport?.passport_country) missingFields.push("passport_country");
      if (!passport?.passport_expiry_date) missingFields.push("passport_expiry_date");

      if (missingFields.length > 0) {
        missing.push({
          memberId,
          displayName,
          missingFields,
        });
      } else {
        completeCount++;
      }
    }

    // Generate numeric trip ID
    let numericTripId: number;
    if (tripData.legacy_id) {
      numericTripId = tripData.legacy_id;
    } else {
      const uuid = tripData.id;
      let hash = 0;
      for (let i = 0; i < uuid.length; i++) {
        const char = uuid.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      numericTripId = Math.abs(hash) % 1000000 + 1000000;
    }

    return NextResponse.json({
      tripId: numericTripId,
      required: true,
      summary: {
        total: attendees.length,
        complete: completeCount,
        missing: missing.length,
      },
      missing,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Get trip compliance error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
