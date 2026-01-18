import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";

/**
 * GET /api/gameday/[roundId]/scorecard
 * Returns scorecard data (trip, participants, scores)
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

    // Find trip
    let tripQuery = supabase
      .from("trips")
      .select("id,group_id,course_id,tee_id,format")
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

    // Fetch participants
    const { data: attendeesData, error: attendeesError } = await supabase
      .from("trip_attendees")
      .select("member_id,status")
      .eq("trip_id", tripData.id)
      .eq("status", "confirmed");

    if (attendeesError) {
      console.warn("[scorecard GET] Failed to fetch attendees:", attendeesError);
    }

    const attendeeMemberIds = (attendeesData || []).map((a: any) => a.member_id).filter(Boolean);

    const participants: Array<{ memberId: string; displayName: string }> = [];
    if (attendeeMemberIds.length > 0) {
      const { data: membersData, error: membersError } = await supabase
        .from("members")
        .select("id,display_name,full_name")
        .in("id", attendeeMemberIds);

      if (membersError) {
        console.warn("[scorecard GET] Failed to fetch members:", membersError);
      } else if (membersData) {
        for (const m of membersData) {
          participants.push({
            memberId: m.id,
            displayName: m.display_name || m.full_name || "Unknown",
          });
        }
      }
    }

    // Fetch scores
    const { data: scoresData, error: scoresError } = await supabase
      .from("gameday_scores")
      .select("member_id,hole_number,strokes,client_updated_at")
      .eq("trip_id", tripData.id);

    if (scoresError) {
      console.warn("[scorecard GET] Failed to fetch scores:", scoresError);
    }

    const scores = (scoresData || []).map((s: any) => ({
      memberId: s.member_id,
      holeNumber: s.hole_number,
      strokes: s.strokes,
      clientUpdatedAt: s.client_updated_at,
    }));

    return NextResponse.json({
      ok: true,
      trip: {
        id: tripData.id,
        groupId: tripData.group_id,
        courseId: tripData.course_id,
        teeId: tripData.tee_id,
        format: tripData.format,
      },
      participants,
      scores,
    });
  } catch (error) {
    console.error("Get scorecard error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/gameday/[roundId]/scorecard
 * Batch upsert scores (offline-safe, idempotent)
 */
export async function POST(
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

    const body = await req.json().catch(() => ({}));
    const { updates, cursor } = body as { 
      updates?: Array<{ memberId: string; holeNumber: number; strokes: number; clientUpdatedAt: string }>;
      cursor?: { currentHoleIndex: number };
    };

    // At least one of updates or cursor must be provided
    if ((!updates || updates.length === 0) && !cursor) {
      return NextResponse.json(
        { ok: false, error: "updates array or cursor is required" },
        { status: 400 }
      );
    }

    // Validate updates array if provided
    if (updates && updates.length > 200) {
      return NextResponse.json(
        { ok: false, error: "updates array too large (max 200)" },
        { status: 400 }
      );
    }

    // Parse roundId
    const numericId = parseInt(roundId, 10);
    const isNumeric = !isNaN(numericId);

    // Find trip
    let tripQuery = supabase
      .from("trips")
      .select("id")
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

    // Handle cursor update if provided (only when state is 'in_progress')
    if (cursor) {
      if (typeof cursor.currentHoleIndex !== "number" || cursor.currentHoleIndex < 0 || cursor.currentHoleIndex > 17) {
        return NextResponse.json(
          { ok: false, error: "cursor.currentHoleIndex must be between 0 and 17" },
          { status: 400 }
        );
      }

      // Check gameday_rounds state
      const { data: gamedayData } = await supabase
        .from("gameday_rounds")
        .select("state")
        .eq("trip_id", tripData.id)
        .maybeSingle();

      if (!gamedayData || gamedayData.state !== "in_progress") {
        return NextResponse.json(
          { ok: false, error: "Can only update cursor when round is in_progress" },
          { status: 400 }
        );
      }

      // Update current_hole_index
      const supabaseService = await createSupabaseServiceClient();
      const { error: cursorError } = await supabaseService
        .from("gameday_rounds")
        .update({ current_hole_index: cursor.currentHoleIndex, updated_at: new Date().toISOString() })
        .eq("trip_id", tripData.id);

      if (cursorError) {
        console.error("[scorecard POST] Failed to update cursor:", cursorError);
        return NextResponse.json(
          { ok: false, error: cursorError.message || "Failed to update cursor" },
          { status: 500 }
        );
      }

      // If only cursor update (no score updates), return success
      if (!updates || updates.length === 0) {
        return NextResponse.json({ ok: true, applied: 0 });
      }
    }

    // Validate and prepare updates (only if updates provided)
    if (!updates || updates.length === 0) {
      return NextResponse.json({ ok: true, applied: 0 });
    }

    // Find caller's flight_id (flight-bounded scoring)
    const { data: flightSlotData } = await supabase
      .from("trip_flight_slots")
      .select("flight_id")
      .eq("member_id", user.id)
      .maybeSingle();

    const flightId = flightSlotData?.flight_id || null;

    if (!flightId) {
      return NextResponse.json(
        { ok: false, error: "Member not assigned to a flight" },
        { status: 400 }
      );
    }

    // Get flight roster (members in caller's flight)
    const { data: flightSlotsData } = await supabase
      .from("trip_flight_slots")
      .select("member_id")
      .eq("flight_id", flightId);

    const flightMemberIds = new Set((flightSlotsData || []).map((s: any) => s.member_id).filter(Boolean));

    // Get committed holes for this flight (locked holes)
    const { data: committedHolesData } = await supabase
      .from("gameday_hole_commits")
      .select("hole_number")
      .eq("trip_id", tripData.id)
      .eq("flight_id", flightId);

    const lockedHoles = new Set((committedHolesData || []).map((c: any) => c.hole_number));

    const now = new Date().toISOString();
    const preparedUpdates: Array<{
      trip_id: string;
      member_id: string;
      hole_number: number;
      strokes: number;
      client_updated_at: string;
      updated_at: string;
    }> = [];
    const rejectedMemberIds: string[] = [];

    for (const update of updates) {
      if (
        typeof update.memberId !== "string" ||
        typeof update.holeNumber !== "number" ||
        typeof update.strokes !== "number" ||
        typeof update.clientUpdatedAt !== "string"
      ) {
        return NextResponse.json(
          { ok: false, error: "Invalid update format" },
          { status: 400 }
        );
      }

      if (update.holeNumber < 1 || update.holeNumber > 18) {
        return NextResponse.json(
          { ok: false, error: "holeNumber must be between 1 and 18" },
          { status: 400 }
        );
      }

      if (update.strokes < 0) {
        return NextResponse.json(
          { ok: false, error: "strokes must be >= 0" },
          { status: 400 }
        );
      }

      const clientUpdatedAt = new Date(update.clientUpdatedAt);
      if (isNaN(clientUpdatedAt.getTime())) {
        return NextResponse.json(
          { ok: false, error: "Invalid clientUpdatedAt timestamp" },
          { status: 400 }
        );
      }

      // Flight-bounded scoring: reject members not in caller's flight
      if (!flightMemberIds.has(update.memberId)) {
        rejectedMemberIds.push(update.memberId);
        continue; // Skip this update
      }

      // Reject writes to committed holes (locked)
      if (lockedHoles.has(update.holeNumber)) {
        continue; // Skip this update (hole is committed)
      }

      preparedUpdates.push({
        trip_id: tripData.id,
        member_id: update.memberId,
        hole_number: update.holeNumber,
        strokes: update.strokes,
        client_updated_at: update.clientUpdatedAt,
        updated_at: now,
      });
    }

    // Fast path: set-based upsert with LWW semantics
    // Use SQL function via RPC for conditional upsert (only update if client_updated_at is newer)
    // Supabase JS .upsert() doesn't support WHERE in DO UPDATE, so SQL function is preferred
    const supabaseService = await createSupabaseServiceClient();
    const updatesJson = JSON.stringify(preparedUpdates);
    
    // Call SQL function for set-based LWW upsert
    // Function: upsert_gameday_scores_lww(update_data jsonb) -> integer
    // Must be created via migration (see phase3_3_gameday_scores_lww_function.sql)
    const { data: appliedCount, error: rpcError } = await supabaseService
      .rpc('upsert_gameday_scores_lww', { update_data: updatesJson })
      .single();

    // If RPC function not available, use client-side LWW filtering with batch upsert
    if (rpcError || appliedCount === null || typeof appliedCount !== 'number') {
      // Fallback: Fetch existing scores in one query, filter by LWW, then batch upsert winners
      const updateKeys = preparedUpdates.map(u => `${u.trip_id}:${u.member_id}:${u.hole_number}`);
      
      const { data: existingScores, error: fetchError } = await supabaseService
        .from("gameday_scores")
        .select("trip_id,member_id,hole_number,client_updated_at")
        .eq("trip_id", tripData.id)
        .in("member_id", [...new Set(preparedUpdates.map(u => u.member_id))])
        .in("hole_number", [...new Set(preparedUpdates.map(u => u.hole_number))]);

      if (fetchError) {
        console.error("[scorecard POST] Failed to fetch existing scores:", fetchError);
        return NextResponse.json(
          { ok: false, error: "Failed to check existing scores" },
          { status: 500 }
        );
      }

      // Build map of existing scores for fast lookup
      const existingMap = new Map<string, string>();
      for (const s of existingScores || []) {
        const key = `${s.trip_id}:${s.member_id}:${s.hole_number}`;
        existingMap.set(key, s.client_updated_at);
      }

      // Filter updates by LWW (only keep rows where new client_updated_at > existing)
      const lwwUpdates = preparedUpdates.filter(update => {
        const key = `${update.trip_id}:${update.member_id}:${update.hole_number}`;
        const existingTime = existingMap.get(key);
        
        if (!existingTime) {
          return true; // New row, include it
        }

        const existing = new Date(existingTime).getTime();
        const incoming = new Date(update.client_updated_at).getTime();
        return incoming > existing; // Only include if newer
      });

      // Batch upsert filtered updates
      if (lwwUpdates.length > 0) {
        const { error: upsertError } = await supabaseService
          .from("gameday_scores")
          .upsert(lwwUpdates, { onConflict: "trip_id,member_id,hole_number" });

        if (upsertError) {
          console.error("[scorecard POST] Batch upsert error:", upsertError);
          return NextResponse.json(
            { ok: false, error: upsertError.message || "Failed to upsert scores" },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({ 
        ok: true, 
        applied: lwwUpdates.length,
        lockedHoles: Array.from(lockedHoles),
        rejectedMemberIds: [...new Set(rejectedMemberIds)]
      });
    }

    // Success with SQL function (fastest path)
    return NextResponse.json({ 
      ok: true, 
      applied: appliedCount,
      lockedHoles: Array.from(lockedHoles),
      rejectedMemberIds: [...new Set(rejectedMemberIds)]
    });
  } catch (error) {
    console.error("Post scorecard error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
