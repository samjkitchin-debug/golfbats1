import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * GET /api/gameday/[roundId]/my-flight
 * Returns caller's flight roster, membershipVersion, and whether it matches latest club_sheet export snapshot.
 * 
 * Response:
 * {
 *   ok: true,
 *   flightId: string | null,
 *   roster: Array<{ memberId: string; displayName: string }>,
 *   membershipVersion: string | null, // max(updated_at) from trip_flight_slots (live)
 *   clubSheetExportedAt: string | null, // updated_at from latest club_sheet export
 *   matchesClubSheet: boolean
 * }
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ roundId: string }> }
) {
  try {
    const { roundId } = await params;
    const supabase = await createSupabaseServerClient();
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // Parse roundId
    const numericId = parseInt(roundId, 10);
    const isNumeric = !isNaN(numericId);

    // Find trip (include tee_id for snapshot)
    let tripQuery = supabase
      .from("trips")
      .select("id,tee_id")
      .eq("trip_origin", "member");

    if (isNumeric) {
      tripQuery = tripQuery.eq("legacy_id", numericId);
    } else {
      tripQuery = tripQuery.eq("id", roundId);
    }

    const { data: tripData, error: tripError } = await tripQuery.single();

    if (tripError || !tripData) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 }
      );
    }

    const tripId = tripData.id;
    const teeId = tripData.tee_id || null;

    // Upsert caller into gameday_round_participants
    // Fetch member data to get declared_handicap and handicap_type
    const { data: memberData } = await supabase
      .from("members")
      .select("id,display_name,full_name,declared_handicap,handicap_type")
      .eq("id", user.id)
      .maybeSingle();

    const declaredHandicap = memberData?.declared_handicap !== null && memberData?.declared_handicap !== undefined
      ? Number(memberData.declared_handicap)
      : null;

    const playingHandicapSnapshot = Math.max(0, Math.round(declaredHandicap ?? 0));

    // Set handicap_source from members.handicap_type, fallback to 'declared_starter'
    const handicapSource = memberData?.handicap_type || "declared_starter";

    // Upsert gameday_round_participants for (trip_id, member_id)
    // Auto-detects unique constraint on (trip_id, member_id)
    const { error: upsertError } = await supabase
      .from("gameday_round_participants")
      .upsert({
        trip_id: tripId,
        member_id: user.id,
        handicap_source: handicapSource,
        handicap_index_snapshot: declaredHandicap,
        playing_handicap_snapshot: playingHandicapSnapshot,
        tee_id_snapshot: teeId,
      });

    if (upsertError) {
      console.error("[my-flight GET] Failed to upsert participant:", upsertError);
      // Continue even if upsert fails (non-critical)
    }

    // Find caller's flight_id from trip_flight_slots
    const { data: flightSlotData, error: flightSlotError } = await supabase
      .from("trip_flight_slots")
      .select("flight_id")
      .eq("member_id", user.id)
      .single();

    // If member not in any flight, check if there's an unassigned flight
    let flightId: string | null = null;
    
    if (flightSlotData) {
      flightId = flightSlotData.flight_id;
    } else {
      // Check for unassigned flight
      const { data: unassignedFlight } = await supabase
        .from("trip_flights")
        .select("id")
        .eq("trip_id", tripId)
        .eq("is_unassigned", true)
        .maybeSingle();
      
      if (unassignedFlight) {
        flightId = unassignedFlight.id;
      }
    }

    // Get flight roster (all members in this flight)
    const roster: Array<{ memberId: string; displayName: string }> = [];
    
    if (flightId) {
      // Get all members in this flight
      const { data: slotsData } = await supabase
        .from("trip_flight_slots")
        .select("member_id")
        .eq("flight_id", flightId);

      const memberIds = (slotsData || []).map((s: any) => s.member_id).filter(Boolean);

      if (memberIds.length > 0) {
        const { data: membersData } = await supabase
          .from("members")
          .select("id,display_name,full_name")
          .in("id", memberIds);

        if (membersData) {
          for (const m of membersData) {
            roster.push({
              memberId: m.id,
              displayName: m.display_name || m.full_name || "Unknown",
            });
          }
        }
      }
    } else {
      // No flight assigned - roster is empty
    }

    // Get membershipVersion (live) from max(updated_at) of trip_flight_slots for this flight
    let membershipVersion: string | null = null;
    let clubSheetExportedAt: string | null = null;
    let matchesClubSheet = false;

    if (flightId) {
      // Get max(updated_at) from trip_flight_slots (live membership version)
      const { data: slotsForVersion } = await supabase
        .from("trip_flight_slots")
        .select("updated_at")
        .eq("flight_id", flightId)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (slotsForVersion && slotsForVersion.length > 0) {
        membershipVersion = slotsForVersion[0].updated_at || null;
      }

      // Get latest club_sheet export for matchesClubSheet comparison
      const { data: exportData } = await supabase
        .from("trip_flight_exports")
        .select("export_data,updated_at")
        .eq("trip_id", tripId)
        .eq("flight_id", flightId)
        .eq("export_type", "club_sheet")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (exportData) {
        clubSheetExportedAt = exportData.updated_at || null;
        
        if (exportData.export_data) {
          // Check if current roster matches export snapshot
          // Compare member IDs from roster with export_data.members array
          const exportMembers = exportData.export_data.members || [];
          const rosterMemberIds = roster.map(r => r.memberId).sort();
          const exportMemberIds = exportMembers.map((m: any) => m.memberId || m.id).filter(Boolean).sort();
          
          matchesClubSheet = 
            rosterMemberIds.length === exportMemberIds.length &&
            rosterMemberIds.every((id, i) => id === exportMemberIds[i]);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      flightId,
      roster,
      membershipVersion,
      clubSheetExportedAt,
      matchesClubSheet,
    });
  } catch (error) {
    console.error("Get my-flight error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
