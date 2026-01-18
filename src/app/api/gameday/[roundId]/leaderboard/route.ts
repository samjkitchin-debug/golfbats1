import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * GET /api/gameday/[roundId]/leaderboard
 * Returns leaderboard data for a round
 * 
 * Query params:
 * - scope: "group" (all flights) or "flight" (default, caller's flight only)
 * 
 * Response:
 * {
 *   ok: true,
 *   scope: "flight" | "group",
 *   thruHole: number,
 *   rows: Array<{
 *     memberId: string,
 *     displayName: string,
 *     grossStrokesThru: number,
 *     nettStrokesThru: number,
 *     stablefordThru: number,
 *     nettToPar: number
 *   }>,
 *   me: { memberId: string, displayName: string, grossStrokesThru: number, nettStrokesThru: number, stablefordThru: number, nettToPar: number } | null
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

    // Parse query params
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") === "group" ? "group" : "flight";

    // Parse roundId
    const numericId = parseInt(roundId, 10);
    const isNumeric = !isNaN(numericId);

    // Find trip
    let tripQuery = supabase
      .from("trips")
      .select("id,course_id,tee_id,format")
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
    const courseId = tripData.course_id;
    const teeId = tripData.tee_id;
    const format = tripData.format || "Stroke";

    if (!courseId || !teeId) {
      return NextResponse.json(
        { ok: false, error: "Course and tee must be set for this trip" },
        { status: 400 }
      );
    }

    // Fetch tee holes (CoursePack data)
    const { data: holesData, error: holesError } = await supabase
      .from("tee_holes")
      .select("hole_number,par,stroke_index")
      .eq("tee_id", teeId)
      .order("hole_number", { ascending: true });

    if (holesError || !holesData || holesData.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Tee holes not found" },
        { status: 404 }
      );
    }

    // Build holes map: hole_number -> { par, stroke_index }
    const holesMap = new Map<number, { par: number; strokeIndex: number }>();
    for (const h of holesData) {
      if (h.par !== null && h.stroke_index !== null) {
        holesMap.set(h.hole_number, {
          par: h.par,
          strokeIndex: h.stroke_index,
        });
      }
    }

    // Resolve caller flight_id
    const { data: callerSlotData } = await supabase
      .from("trip_flight_slots")
      .select("flight_id")
      .eq("member_id", user.id)
      .eq("trip_id", tripId)
      .maybeSingle();

    const callerFlightId = callerSlotData?.flight_id || null;

    // Determine participant member IDs based on scope
    let participantMemberIds: string[] = [];

    if (scope === "group") {
      // All confirmed attendees in trip
      const { data: attendeesData } = await supabase
        .from("trip_attendees")
        .select("member_id")
        .eq("trip_id", tripId)
        .eq("status", "confirmed");

      participantMemberIds = (attendeesData || []).map((a: any) => a.member_id).filter(Boolean);
    } else {
      // Flight scope: only members in caller's flight
      if (!callerFlightId) {
        // No flight assigned - return empty leaderboard
        return NextResponse.json({
          ok: true,
          scope: "flight",
          thruHole: 0,
          rows: [],
          me: null,
        });
      }

      const { data: slotsData } = await supabase
        .from("trip_flight_slots")
        .select("member_id")
        .eq("flight_id", callerFlightId);

      participantMemberIds = (slotsData || []).map((s: any) => s.member_id).filter(Boolean);
    }

    if (participantMemberIds.length === 0) {
      return NextResponse.json({
        ok: true,
        scope,
        thruHole: 0,
        rows: [],
        me: null,
      });
    }

    // Fetch participant metadata with handicap snapshots
    const { data: participantsData } = await supabase
      .from("gameday_round_participants")
      .select("member_id,playing_handicap_snapshot,display_name")
      .eq("trip_id", tripId)
      .in("member_id", participantMemberIds);

    // Fetch members for fallback handicap and display names
    const { data: membersData } = await supabase
      .from("members")
      .select("id,display_name,full_name,declared_handicap")
      .in("id", participantMemberIds);

    // Build participant map: member_id -> { displayName, playingHandicap }
    const participantsMap = new Map<string, { displayName: string; playingHandicap: number }>();
    
    for (const memberId of participantMemberIds) {
      const participant = participantsData?.find((p: any) => p.member_id === memberId);
      const member = membersData?.find((m: any) => m.id === memberId);

      const displayName = participant?.display_name || 
                         member?.display_name || 
                         member?.full_name || 
                         "Unknown";

      // Prefer gameday_round_participants.playing_handicap_snapshot (primary)
      // If null, derive ph = max(0, Math.round(members.declared_handicap ?? 0))
      const playingHandicap = participant?.playing_handicap_snapshot !== null && participant?.playing_handicap_snapshot !== undefined
        ? Math.round(Number(participant.playing_handicap_snapshot))
        : Math.max(0, Math.round(member?.declared_handicap ?? 0));

      participantsMap.set(memberId, { displayName, playingHandicap });
    }

    // Determine thruHole based on scope
    let thruHole = 0;

    if (scope === "flight") {
      // Flight scope: max committed hole for that flight
      if (callerFlightId) {
        const { data: commitsData } = await supabase
          .from("gameday_hole_commits")
          .select("hole_number")
          .eq("trip_id", tripId)
          .eq("flight_id", callerFlightId);

        if (commitsData && commitsData.length > 0) {
          thruHole = Math.max(...commitsData.map((c: any) => c.hole_number));
        }
      }
    } else {
      // Group scope: max committed hole across all flights
      const { data: commitsData } = await supabase
        .from("gameday_hole_commits")
        .select("hole_number")
        .eq("trip_id", tripId);

      if (commitsData && commitsData.length > 0) {
        thruHole = Math.max(...commitsData.map((c: any) => c.hole_number));
      }
    }

    // Fetch strokes for relevant members up to thruHole
    const { data: scoresData } = await supabase
      .from("gameday_scores")
      .select("member_id,hole_number,strokes")
      .eq("trip_id", tripId)
      .in("member_id", participantMemberIds)
      .lte("hole_number", thruHole);

    // Build scores map: member_id -> hole_number -> strokes
    const scoresMap = new Map<string, Map<number, number>>();
    for (const score of scoresData || []) {
      const memberId = score.member_id;
      const holeNumber = score.hole_number;
      const strokes = score.strokes;

      if (!scoresMap.has(memberId)) {
        scoresMap.set(memberId, new Map());
      }
      scoresMap.get(memberId)!.set(holeNumber, strokes);
    }

    // Compute per-member statistics
    const rows: Array<{
      memberId: string;
      displayName: string;
      grossStrokesThru: number;
      nettStrokesThru: number;
      stablefordThru: number;
      nettToPar: number;
    }> = [];

    for (const memberId of participantMemberIds) {
      const participant = participantsMap.get(memberId);
      if (!participant) continue;

      const { displayName, playingHandicap } = participant;
      const memberScores = scoresMap.get(memberId) || new Map();

      let grossStrokesThru = 0;
      let nettStrokesThru = 0;
      let stablefordThru = 0;
      let totalPar = 0;

      // Process holes 1 through thruHole
      for (let holeNum = 1; holeNum <= thruHole; holeNum++) {
        const hole = holesMap.get(holeNum);
        if (!hole) continue; // Skip if hole data missing

        const strokes = memberScores.get(holeNum);
        if (strokes === undefined) continue; // Skip if no score

        const { par, strokeIndex } = hole;
        grossStrokesThru += strokes;

        // Shots received per hole (v1 standard allocation)
        // base = Math.floor(ph / 18)
        // rem = ph % 18
        // shots = base + (strokeIndex <= rem ? 1 : 0)
        // If strokeIndex null, treat shots=0 for that hole
        const base = Math.floor(playingHandicap / 18);
        const rem = playingHandicap % 18;
        const shots = strokeIndex !== null && strokeIndex !== undefined
          ? base + (strokeIndex <= rem ? 1 : 0)
          : 0;

        // Nett: strokes - shots
        const nett = strokes - shots;
        nettStrokesThru += nett;

        // Stableford points based on diff = nett - par
        // Points mapping:
        // if diff <= -4 => 6
        // else if diff == -3 => 5
        // else if diff == -2 => 4
        // else if diff == -1 => 3
        // else if diff == 0 => 2
        // else if diff == 1 => 1
        // else => 0
        const diff = nett - par;
        let stablefordPoints = 0;
        if (diff <= -4) {
          stablefordPoints = 6;
        } else if (diff === -3) {
          stablefordPoints = 5;
        } else if (diff === -2) {
          stablefordPoints = 4;
        } else if (diff === -1) {
          stablefordPoints = 3;
        } else if (diff === 0) {
          stablefordPoints = 2;
        } else if (diff === 1) {
          stablefordPoints = 1;
        }
        stablefordThru += stablefordPoints;

        totalPar += par;
      }

      const nettToPar = nettStrokesThru - totalPar;

      rows.push({
        memberId,
        displayName,
        grossStrokesThru,
        nettStrokesThru,
        stablefordThru,
        nettToPar,
      });
    }

    // Sort rows
    if (format === "Stableford" || format === "stableford") {
      // Primary: stablefordThru desc, tie-break: displayName asc
      rows.sort((a, b) => {
        if (b.stablefordThru !== a.stablefordThru) {
          return b.stablefordThru - a.stablefordThru;
        }
        return a.displayName.localeCompare(b.displayName);
      });
    } else {
      // Stroke play: primary: nettStrokesThru asc, tie-break: displayName asc
      rows.sort((a, b) => {
        if (a.nettStrokesThru !== b.nettStrokesThru) {
          return a.nettStrokesThru - b.nettStrokesThru;
        }
        return a.displayName.localeCompare(b.displayName);
      });
    }

    // Find caller's computed row (no rank)
    const callerRow = rows.find((r) => r.memberId === user.id);
    const me = callerRow || null;

    return NextResponse.json({
      ok: true,
      scope,
      thruHole,
      rows,
      me,
    });
  } catch (error) {
    console.error("Get leaderboard error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
