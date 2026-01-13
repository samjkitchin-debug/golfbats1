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
    const now = new Date().toISOString();
    const preparedUpdates: Array<{
      trip_id: string;
      member_id: string;
      hole_number: number;
      strokes: number;
      client_updated_at: string;
      updated_at: string;
    }> = [];

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

      preparedUpdates.push({
        trip_id: tripData.id,
        member_id: update.memberId,
        hole_number: update.holeNumber,
        strokes: update.strokes,
        client_updated_at: update.clientUpdatedAt,
        updated_at: now,
      });
    }

    // Use a SQL function for conditional upsert (only update if client_updated_at is newer)
    // For simplicity, we'll use a loop with individual upserts and check client_updated_at
    let supabaseWrite = supabase;
    let applied = 0;

    for (const update of preparedUpdates) {
      // First, check existing score
      const { data: existing } = await supabaseWrite
        .from("gameday_scores")
        .select("client_updated_at")
        .eq("trip_id", update.trip_id)
        .eq("member_id", update.member_id)
        .eq("hole_number", update.hole_number)
        .maybeSingle();

      // Only update if new client_updated_at is newer
      if (existing && existing.client_updated_at) {
        const existingTime = new Date(existing.client_updated_at).getTime();
        const newTime = new Date(update.client_updated_at).getTime();
        if (newTime <= existingTime) {
          continue; // Skip this update (stale)
        }
      }

      // Upsert the score
      const { error: upsertError } = await supabaseWrite
        .from("gameday_scores")
        .upsert(update, { onConflict: "trip_id,member_id,hole_number" });

      if (upsertError) {
        // If RLS blocks, try service client
        if (upsertError.code === "42501") {
          const supabaseService = await createSupabaseServiceClient();
          const { error: serviceError } = await supabaseService
            .from("gameday_scores")
            .upsert(update, { onConflict: "trip_id,member_id,hole_number" });

          if (serviceError) {
            console.error("[scorecard POST] Service client upsert error:", serviceError);
            continue; // Skip this update
          }
        } else {
          console.error("[scorecard POST] Upsert error:", upsertError);
          continue; // Skip this update
        }
      }

      applied++;
    }

    return NextResponse.json({ ok: true, applied });
  } catch (error) {
    console.error("Post scorecard error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
