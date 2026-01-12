import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

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
    const supabase = await createSupabaseServerClient();
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse roundId - could be numeric legacy_id or UUID
    const numericId = parseInt(roundId, 10);
    const isNumeric = !isNaN(numericId);

    // Find trip by legacy_id or id (UUID)
    let tripQuery = supabase
      .from("trips")
      .select("id,legacy_id,course_id,tee_id,trip_date,status")
      .eq("trip_origin", "member"); // GameDay is only for member-hosted rounds

    if (isNumeric) {
      tripQuery = tripQuery.eq("legacy_id", numericId);
    } else {
      tripQuery = tripQuery.eq("id", roundId);
    }

    const { data: tripData, error: tripError } = await tripQuery.single();

    if (tripError || !tripData) {
      return NextResponse.json(
        { error: "Round not found." },
        { status: 404 }
      );
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

    return NextResponse.json({
      ok: true,
      roundId: numericRoundId,
      participants,
      courseId: tripData.course_id,
      teeId: tripData.tee_id,
      status,
    });
  } catch (error) {
    console.error("Get gameday error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
