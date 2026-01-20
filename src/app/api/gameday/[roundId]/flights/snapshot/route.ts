import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { isLegacyNumericId, safeParseUUID } from "@/app/lib/invariants";
import { getFlightsSnapshotServer } from "@/app/lib/domain/flights/getFlightsSnapshot";

export const dynamic = "force-dynamic";

/**
 * GET /api/gameday/[roundId]/flights/snapshot
 * 
 * Returns flights snapshot for a trip.
 * 
 * Response:
 * {
 *   ok: true,
 *   snapshot: FlightsSnapshot
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

    // Resolve tripId from roundId
    const isUUID = safeParseUUID(roundId) !== null;
    const isNumeric = isLegacyNumericId(roundId);

    if (!isUUID && !isNumeric) {
      return NextResponse.json(
        { ok: false, error: "invalid_round_id" },
        { status: 400 }
      );
    }

    let tripQuery = supabase
      .from("trips")
      .select("id")
      .eq("trip_origin", "member");

    if (isNumeric) {
      const numericId = parseInt(roundId, 10);
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

    // Get snapshot using server client (RLS applies)
    const snapshot = await getFlightsSnapshotServer(supabase, tripId);

    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    console.error("[flights/snapshot] Error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 }
    );
  }
}
