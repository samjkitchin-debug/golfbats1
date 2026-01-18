import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { isLegacyNumericId, safeParseUUID } from "@/app/lib/invariants";
import { jsonError, jsonOk } from "@/app/lib/http";

export const dynamic = "force-dynamic";

function isExpiredForTripDate(
  tripDate: string | null | undefined,
  timeZone?: string | null
): boolean {
  if (!tripDate) return false;

  const tz =
    typeof timeZone === "string" && timeZone.length > 0
      ? timeZone
      : "Asia/Singapore";

  const now = new Date();

  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const todayLocal = fmt.format(now);           // YYYY-MM-DD in trip timezone
  const tripDayLocal = fmt.format(new Date(tripDate));

  // Expire if the trip day is before today in the trip's local timezone
  return tripDayLocal < todayLocal;
}

/**
 * GET /api/gameday/[roundId]
 * Returns minimal context for GameDay screen
 * 
 * Response:
 * {
 *   ok: true,
 *   roundId: number,
 *   participants: Array<{ id: string; displayName: string }>,
 *   courseId: string | null,
 *   teeId: string | null,
 *   status: "not_started" | "in_progress" | "finished"
 * }
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ roundId: string }> }
) {
  try {
    const { roundId } = await params;
    
    // Validate roundId: must be UUID or numeric legacy id
    const isUUID = safeParseUUID(roundId) !== null;
    const isNumeric = isLegacyNumericId(roundId);
    
    if (!isUUID && !isNumeric) {
      return jsonError(400, "invalid_round_id", "Round ID must be a valid UUID or numeric ID");
    }
    
    const supabase = await createSupabaseServerClient();
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return jsonError(401, "unauthorized", "Unauthorized");
    }

    // Parse roundId - could be numeric legacy_id or UUID
    const numericId = isNumeric ? parseInt(roundId, 10) : null;

    // Find trip by legacy_id or id (UUID)
    // GameDay core payload; heavy holes fetched via /course-pack
    let tripQuery = supabase
      .from("trips")
      .select("id,legacy_id,group_id,trip_date,format,course_id,tee_id,meeting_point,meet_time,status,created_by_member_id,timezone,courses(timezone)");

    if (isNumeric) {
      tripQuery = tripQuery.eq("legacy_id", numericId);
    } else {
      tripQuery = tripQuery.eq("id", roundId);
    }

    const { data: tripData, error: tripError } = await tripQuery.single();

    if (tripError || !tripData) {
      return jsonError(404, "not_found", "Round not found");
    }

    // Get timezone from trip or course
    const tripTimezone = (tripData as any).timezone;
    const courseTimezone = (tripData as any).courses?.timezone;
    const effectiveTimezone = tripTimezone ?? courseTimezone;

    // Check if trip has expired (after 23:59 in trip's local timezone)
    if (isExpiredForTripDate(tripData.trip_date, effectiveTimezone)) {
      return jsonError(404, "not_found", "Round not found");
    }

    // Get current member ID for visibility check
    let currentMemberId: string | null = null;
    const { data: memberData } = await supabase
      .from("members")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    currentMemberId = memberData?.id || null;

    // Fetch attendees (participants)
    const { data: attendeesData, error: attendeesError } = await supabase
      .from("trip_attendees")
      .select("member_id,status")
      .eq("trip_id", tripData.id)
      .eq("status", "confirmed"); // Only confirmed participants

    if (attendeesError) {
      console.warn("[gameday API] Failed to fetch attendees:", attendeesError);
    }

    const attendeeMemberIds = (attendeesData || []).map((a: any) => a.member_id).filter(Boolean);

    // Enforce visibility: only creator or confirmed attendees can access
    const isCreator = tripData.created_by_member_id && tripData.created_by_member_id === currentMemberId;
    const isConfirmedAttendee = attendeeMemberIds.includes(currentMemberId || "");

    if (!isCreator && !isConfirmedAttendee) {
      return jsonError(404, "not_found", "Round not found");
    }

    // Fetch member display names
    const participants: Array<{ id: string; displayName: string }> = [];
    if (attendeeMemberIds.length > 0) {
      const { data: membersData, error: membersError } = await supabase
        .from("members")
        .select("id,display_name,full_name")
        .in("id", attendeeMemberIds);

      if (membersError) {
        console.warn("[gameday API] Failed to fetch members:", membersError);
      } else if (membersData) {
        for (const m of membersData) {
          participants.push({
            id: m.id,
            displayName: m.display_name || m.full_name || "Unknown",
          });
        }
      }
    }

    // Fetch gameday_rounds state
    const { data: gamedayData, error: gamedayError } = await supabase
      .from("gameday_rounds")
      .select("trip_id,state,locked_course_id,locked_tee_id,started_at,closed_at,published_at,start_hole,holes_to_play,current_hole_index")
      .eq("trip_id", tripData.id)
      .maybeSingle();

    // Virtual default if no row exists
    const gameday = gamedayData
      ? {
          state: gamedayData.state,
          lockedCourseId: gamedayData.locked_course_id,
          lockedTeeId: gamedayData.locked_tee_id,
          startedAt: gamedayData.started_at,
          closedAt: gamedayData.closed_at,
          publishedAt: gamedayData.published_at,
          startHole: gamedayData.start_hole ?? 1,
          holesToPlay: gamedayData.holes_to_play ?? 18,
          currentHoleIndex: gamedayData.current_hole_index ?? 0,
        }
      : { state: "not_started" as const };

    // Derive status (code-only, no schema changes)
    // For now, all rounds are "not_started" - this will be enhanced later
    const status: "not_started" | "in_progress" | "finished" = "not_started";

    // Generate numeric ID
    let numericRoundId: number;
    if (tripData.legacy_id) {
      numericRoundId = tripData.legacy_id;
    } else {
      const uuid = tripData.id;
      let hash = 0;
      for (let i = 0; i < uuid.length; i++) {
        const char = uuid.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      numericRoundId = Math.abs(hash) % 1000000 + 1000000;
    }

    return jsonOk({
      roundId: numericRoundId,
      tripId: tripData.id,
      groupId: tripData.group_id,
      tripDate: tripData.trip_date,
      format: tripData.format,
      courseId: tripData.course_id,
      teeId: tripData.tee_id,
      meetingPoint: tripData.meeting_point,
      meetTime: tripData.meet_time,
      participants,
      status,
      gameday,
    });
  } catch (error) {
    console.error("Get gameday error:", error);
    return jsonError(500, "internal_error", "An error occurred while loading GameDay data");
  }
}
