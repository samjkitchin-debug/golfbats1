import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";

/**
 * POST /api/gameday/[roundId]/start
 * Starts a GameDay round (creates/updates gameday_rounds)
 * 
 * Body (optional):
 * {
 *   startHole?: number (1-18),
 *   holesToPlay?: 9 | 18
 * }
 * 
 * Response:
 * {
 *   ok: true,
 *   gameday: {
 *     tripId: string,
 *     state: 'in_progress',
 *     lockedCourseId: string,
 *     lockedTeeId: string,
 *     startedAt: string,
 *     startHole: number,
 *     holesToPlay: number,
 *     currentHoleIndex: number
 *   }
 * }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ roundId: string }> }
) {
  try {
    const { roundId } = await params;
    const supabase = await createSupabaseServerClient();
    
    // Parse optional body
    let body: { startHole?: number; holesToPlay?: number } = {};
    try {
      body = await req.json().catch(() => ({}));
    } catch {
      // No body provided, use defaults
    }
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // Parse roundId - could be numeric legacy_id or UUID
    const numericId = parseInt(roundId, 10);
    const isNumeric = !isNaN(numericId);

    // Find trip by legacy_id or id (UUID)
    let tripQuery = supabase
      .from("trips")
      .select("id,group_id,course_id,tee_id")
      .eq("trip_origin", "member"); // GameDay is only for member-hosted rounds

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

    if (!tripData.tee_id) {
      return NextResponse.json(
        { ok: false, error: "missing_tee" },
        { status: 400 }
      );
    }

    if (!tripData.course_id) {
      return NextResponse.json(
        { ok: false, error: "missing_course" },
        { status: 400 }
      );
    }

    // Check if gameday_rounds already exists
    const { data: existing } = await supabase
      .from("gameday_rounds")
      .select("started_at,start_hole,holes_to_play")
      .eq("trip_id", tripData.id)
      .maybeSingle();

    // Validate and clamp start settings
    let startHole = body.startHole ?? existing?.start_hole ?? 1;
    let holesToPlay = body.holesToPlay ?? existing?.holes_to_play ?? 18;

    // Clamp and validate
    startHole = Math.max(1, Math.min(18, Math.floor(startHole) || 1));
    holesToPlay = holesToPlay === 9 ? 9 : 18;

    // Upsert gameday_rounds
    // Use service client if RLS blocks, otherwise use regular client
    let supabaseWrite = supabase;
    const now = new Date().toISOString();

    const upsertData: any = {
      trip_id: tripData.id,
      state: "in_progress",
      locked_course_id: tripData.course_id,
      locked_tee_id: tripData.tee_id,
      start_hole: startHole,
      holes_to_play: holesToPlay,
      current_hole_index: 0,
      updated_at: now,
    };

    // Only set started_at if it's null (preserve original start time)
    if (!existing || !existing.started_at) {
      upsertData.started_at = now;
    }

    const { data: gamedayData, error: upsertError } = await supabaseWrite
      .from("gameday_rounds")
      .upsert(upsertData, { onConflict: "trip_id" })
      .select("trip_id,state,locked_course_id,locked_tee_id,started_at,start_hole,holes_to_play,current_hole_index")
      .single();

    // If RLS blocks, try with service client
    if (upsertError && upsertError.code === "42501") {
      const supabaseService = await createSupabaseServiceClient();
      const serviceUpsertData = { ...upsertData };
      const { data: serviceData, error: serviceError } = await supabaseService
        .from("gameday_rounds")
        .upsert(serviceUpsertData, { onConflict: "trip_id" })
        .select("trip_id,state,locked_course_id,locked_tee_id,started_at,start_hole,holes_to_play,current_hole_index")
        .single();

      if (serviceError || !serviceData) {
        return NextResponse.json(
          { ok: false, error: serviceError?.message || "Failed to start round" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        gameday: {
          tripId: serviceData.trip_id,
          state: serviceData.state,
          lockedCourseId: serviceData.locked_course_id,
          lockedTeeId: serviceData.locked_tee_id,
          startedAt: serviceData.started_at,
          startHole: serviceData.start_hole,
          holesToPlay: serviceData.holes_to_play,
          currentHoleIndex: serviceData.current_hole_index,
        },
      });
    }

    if (upsertError || !gamedayData) {
      return NextResponse.json(
        { ok: false, error: upsertError?.message || "Failed to start round" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      gameday: {
        tripId: gamedayData.trip_id,
        state: gamedayData.state,
        lockedCourseId: gamedayData.locked_course_id,
        lockedTeeId: gamedayData.locked_tee_id,
        startedAt: gamedayData.started_at,
        startHole: gamedayData.start_hole,
        holesToPlay: gamedayData.holes_to_play,
        currentHoleIndex: gamedayData.current_hole_index,
      },
    });
  } catch (error) {
    console.error("Start gameday error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
