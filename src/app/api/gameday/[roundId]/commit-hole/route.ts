import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";

/**
 * POST /api/gameday/[roundId]/commit-hole
 * Commits a hole (locks scores for a specific hole)
 * 
 * Request body:
 * {
 *   holeNumber: number (1-18),
 *   clientCommitId: string (uuid),
 *   cursor?: { currentHoleIndex: number }
 * }
 * 
 * Response:
 * {
 *   ok: true,
 *   alreadyCommitted?: boolean
 * }
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
    const { holeNumber, clientCommitId, cursor } = body as {
      holeNumber?: number;
      clientCommitId?: string;
      cursor?: { currentHoleIndex?: number };
    };

    // Validate request body
    if (typeof holeNumber !== "number" || holeNumber < 1 || holeNumber > 18) {
      return NextResponse.json(
        { ok: false, error: "holeNumber must be between 1 and 18" },
        { status: 400 }
      );
    }

    if (typeof clientCommitId !== "string" || !clientCommitId) {
      return NextResponse.json(
        { ok: false, error: "clientCommitId is required (uuid string)" },
        { status: 400 }
      );
    }

    if (cursor && (typeof cursor.currentHoleIndex !== "number" || cursor.currentHoleIndex < 0 || cursor.currentHoleIndex > 17)) {
      return NextResponse.json(
        { ok: false, error: "cursor.currentHoleIndex must be between 0 and 17" },
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

    const tripId = tripData.id;

    // Find caller's flight_id
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

    // Check gameday_flight_rounds state (must be 'in_progress')
    const { data: gamedayData, error: gamedayError } = await supabase
      .from("gameday_flight_rounds")
      .select("state")
      .eq("flight_id", flightId)
      .maybeSingle();

    if (gamedayError) {
      console.error("[commit-hole] Failed to fetch gameday_flight_rounds:", gamedayError);
      return NextResponse.json(
        { ok: false, error: "Failed to check round state" },
        { status: 500 }
      );
    }

    if (!gamedayData || gamedayData.state !== "in_progress") {
      return NextResponse.json(
        { ok: false, error: "Round must be in_progress to commit holes" },
        { status: 400 }
      );
    }

    // Check if commit already exists for this flight (idempotency check)
    const { data: existingCommit } = await supabase
      .from("gameday_hole_commits")
      .select("id")
      .eq("trip_id", tripId)
      .eq("flight_id", flightId)
      .eq("hole_number", holeNumber)
      .maybeSingle();

    if (existingCommit) {
      return NextResponse.json({ ok: true, alreadyCommitted: true });
    }

    // Fetch flight roster (members in this flight)
    const { data: flightSlotsData, error: flightSlotsError } = await supabase
      .from("trip_flight_slots")
      .select("member_id")
      .eq("flight_id", flightId);

    if (flightSlotsError) {
      console.error("[commit-hole] Failed to fetch flight slots:", flightSlotsError);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch flight roster" },
        { status: 500 }
      );
    }

    const flightMemberIds = (flightSlotsData || []).map((s: any) => s.member_id).filter(Boolean);

    // Fetch scores for this hole from flight members
    const { data: scoresData, error: scoresError } = await supabase
      .from("gameday_scores")
      .select("member_id,hole_number,strokes")
      .eq("trip_id", tripId)
      .eq("hole_number", holeNumber)
      .in("member_id", flightMemberIds.length > 0 ? flightMemberIds : ["__empty__"]);

    if (scoresError) {
      console.error("[commit-hole] Failed to fetch scores:", scoresError);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch scores" },
        { status: 500 }
      );
    }

    // Build scores_json snapshot
    const scoresJson = (scoresData || []).map((s: any) => ({
      memberId: s.member_id,
      holeNumber: s.hole_number,
      strokes: s.strokes,
    }));

    // Insert commit record (with flight_id)
    const commitData = {
      trip_id: tripId,
      flight_id: flightId,
      hole_number: holeNumber,
      committed_by_member_id: user.id,
      client_commit_id: clientCommitId,
      scores_json: scoresJson,
    };

    let supabaseWrite = supabase;
    const { data: commitResult, error: commitError } = await supabaseWrite
      .from("gameday_hole_commits")
      .insert(commitData)
      .select("id")
      .single();

    // If RLS blocks, try service client
    if (commitError && commitError.code === "42501") {
      const supabaseService = await createSupabaseServiceClient();
      const { data: serviceResult, error: serviceError } = await supabaseService
        .from("gameday_hole_commits")
        .insert(commitData)
        .select("id")
        .single();

      if (serviceError) {
        // Check if error is due to unique constraint (already committed)
        if (serviceError.code === "23505") {
          return NextResponse.json({ ok: true, alreadyCommitted: true });
        }
        console.error("[commit-hole] Service client insert error:", serviceError);
        return NextResponse.json(
          { ok: false, error: serviceError.message || "Failed to commit hole" },
          { status: 500 }
        );
      }

      // Commit successful, handle cursor if provided (update gameday_flight_rounds)
      if (cursor && typeof cursor.currentHoleIndex === "number") {
        // Update current_hole_index in gameday_flight_rounds (forward-only)
        const { data: currentRoundData } = await supabaseService
          .from("gameday_flight_rounds")
          .select("current_hole_index")
          .eq("flight_id", flightId)
          .maybeSingle();

        if (currentRoundData && cursor.currentHoleIndex > currentRoundData.current_hole_index) {
          const { error: cursorError } = await supabaseService
            .from("gameday_flight_rounds")
            .update({ 
              current_hole_index: cursor.currentHoleIndex,
              updated_at: new Date().toISOString()
            })
            .eq("flight_id", flightId);

          if (cursorError) {
            console.warn("[commit-hole] Failed to update cursor:", cursorError);
            // Non-fatal; commit succeeded
          }
        }
      }

      return NextResponse.json({ ok: true });
    }

    if (commitError) {
      // Check if error is due to unique constraint (already committed)
      if (commitError.code === "23505") {
        return NextResponse.json({ ok: true, alreadyCommitted: true });
      }
      console.error("[commit-hole] Insert error:", commitError);
      return NextResponse.json(
        { ok: false, error: commitError.message || "Failed to commit hole" },
        { status: 500 }
      );
    }

    if (!commitResult) {
      return NextResponse.json(
        { ok: false, error: "Failed to create commit record" },
        { status: 500 }
      );
    }

    // Commit successful, handle cursor if provided (update gameday_flight_rounds)
    if (cursor && typeof cursor.currentHoleIndex === "number") {
      // Fetch current current_hole_index from gameday_flight_rounds
      const { data: currentRoundData } = await supabaseWrite
        .from("gameday_flight_rounds")
        .select("current_hole_index")
        .eq("flight_id", flightId)
        .maybeSingle();

      // Only update if new index is greater (forward-only)
      if (currentRoundData && cursor.currentHoleIndex > currentRoundData.current_hole_index) {
        const { error: cursorError } = await supabaseWrite
          .from("gameday_flight_rounds")
          .update({ 
            current_hole_index: cursor.currentHoleIndex,
            updated_at: new Date().toISOString()
          })
          .eq("flight_id", flightId);

        if (cursorError) {
          // If RLS blocks, try service client
          if (cursorError.code === "42501") {
            const supabaseService = await createSupabaseServiceClient();
            const { error: serviceCursorError } = await supabaseService
              .from("gameday_flight_rounds")
              .update({ 
                current_hole_index: cursor.currentHoleIndex,
                updated_at: new Date().toISOString()
              })
              .eq("flight_id", flightId);

            if (serviceCursorError) {
              console.warn("[commit-hole] Failed to update cursor with service client:", serviceCursorError);
              // Non-fatal; commit succeeded
            }
          } else {
            console.warn("[commit-hole] Failed to update cursor:", cursorError);
            // Non-fatal; commit succeeded
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Commit hole error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
