import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { getFlightsSnapshotServer } from "@/app/lib/domain/flights/getFlightsSnapshot";

export const dynamic = "force-dynamic";

/**
 * GET /api/trips/[id]/flights/snapshot
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // Invariant: Route param [id] may be legacy numeric id or UUID. We always resolve to canonical trips.id (UUID) before role checks and mutations.
    const isNumeric = /^[0-9]+$/.test(id);
    const parsed = isNumeric ? Number(id) : null;
    let tripQuery = supabase.from("trips").select("id").limit(1);
    tripQuery = isNumeric ? tripQuery.eq("legacy_id", parsed) : tripQuery.eq("id", id);
    const { data: tripData, error: tripError } = await tripQuery.maybeSingle();

    if (tripError || !tripData) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 }
      );
    }

    const tripUuid = tripData.id;

    // Get snapshot using server client (RLS applies); use canonical trip UUID
    const snapshot = await getFlightsSnapshotServer(supabase, tripUuid);

    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    console.error("[trips/flights/snapshot] Error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 }
    );
  }
}
