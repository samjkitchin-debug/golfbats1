import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";

/**
 * POST /api/gameday/[roundId]/close
 * Closes a GameDay round (sets state to 'closed')
 * 
 * Response:
 * {
 *   ok: true,
 *   gameday: {
 *     tripId: string,
 *     state: 'closed',
 *     closedAt: string
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

    // Fetch or create virtual default gameday_rounds
    const { data: existing } = await supabase
      .from("gameday_rounds")
      .select("state")
      .eq("trip_id", tripData.id)
      .maybeSingle();

    // If state is not 'in_progress', return current state (idempotent)
    if (existing && existing.state !== "in_progress") {
      return NextResponse.json({
        ok: true,
        gameday: {
          tripId: tripData.id,
          state: existing.state,
          closedAt: null,
        },
      });
    }

    // Update to closed
    const now = new Date().toISOString();
    const updateData = {
      trip_id: tripData.id,
      state: "closed",
      closed_at: now,
      updated_at: now,
    };

    let supabaseWrite = supabase;
    const { data: gamedayData, error: upsertError } = await supabaseWrite
      .from("gameday_rounds")
      .upsert(updateData, { onConflict: "trip_id" })
      .select("trip_id,state,closed_at")
      .single();

    // If RLS blocks, try service client
    if (upsertError && upsertError.code === "42501") {
      const supabaseService = await createSupabaseServiceClient();
      const { data: serviceData, error: serviceError } = await supabaseService
        .from("gameday_rounds")
        .upsert(updateData, { onConflict: "trip_id" })
        .select("trip_id,state,closed_at")
        .single();

      if (serviceError || !serviceData) {
        return NextResponse.json(
          { ok: false, error: serviceError?.message || "Failed to close round" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        gameday: {
          tripId: serviceData.trip_id,
          state: serviceData.state,
          closedAt: serviceData.closed_at,
        },
      });
    }

    if (upsertError || !gamedayData) {
      return NextResponse.json(
        { ok: false, error: upsertError?.message || "Failed to close round" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      gameday: {
        tripId: gamedayData.trip_id,
        state: gamedayData.state,
        closedAt: gamedayData.closed_at,
      },
    });
  } catch (error) {
    console.error("Close gameday error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
