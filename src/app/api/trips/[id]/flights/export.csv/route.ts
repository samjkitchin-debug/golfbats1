import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { requireAuthedUser } from "@/app/lib/serverAuth";

/**
 * GET /api/trips/[id]/flights/export.csv
 * 
 * Export flights as CSV for course-friendly format.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { id } = await params;

    // Invariant: Route param [id] may be legacy numeric id or UUID. We always resolve to canonical trips.id (UUID) before role checks and mutations.
    const isNumeric = /^[0-9]+$/.test(id);
    const parsed = isNumeric ? Number(id) : null;
    let tripQuery = supabase.from("trips").select("id").limit(1);
    tripQuery = isNumeric ? tripQuery.eq("legacy_id", parsed) : tripQuery.eq("id", id);
    const { data: tripData, error: tripErr } = await tripQuery.maybeSingle();

    if (tripErr || !tripData) {
      return NextResponse.json(
        { error: "Trip not found." },
        { status: 404 }
      );
    }

    const tripUuid = tripData.id;

    try {
      await requireAuthedUser();
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "UNAUTHORIZED") {
        return NextResponse.json({ error: "Not signed in." }, { status: 401 });
      }
      throw e;
    }

    // Fetch flights with slots and member names (use canonical trip UUID)
    const { data: flightsData, error: flightsErr } = await supabase
      .from("trip_flights")
      .select(`
        flight_number,
        trip_flight_slots(
          slot_position,
          members(display_name, full_name)
        )
      `)
      .eq("trip_id", tripUuid)
      .order("flight_number", { ascending: true });

    if (flightsErr) {
      console.error("Failed to fetch flights:", flightsErr);
      return NextResponse.json(
        { error: "Failed to fetch flights." },
        { status: 500 }
      );
    }

    if (!flightsData || flightsData.length === 0) {
      return NextResponse.json(
        { error: "No flights found for this trip." },
        { status: 404 }
      );
    }

    // Build CSV
    const rows: string[] = [];
    
    // Header
    rows.push("Flight,Slot,Name");

    // Data rows
    for (const flight of flightsData) {
      const slots = (flight.trip_flight_slots || []).sort(
        (a: any, b: any) => a.slot_position - b.slot_position
      );

      for (const slot of slots) {
        const member = Array.isArray(slot.members) ? slot.members[0] : slot.members;
        const memberName = member?.display_name || member?.full_name || "Unknown";
        rows.push(
          `${flight.flight_number},${slot.slot_position},"${memberName.replace(/"/g, '""')}"`
        );
      }
    }

    const csv = rows.join("\n");

    // Return CSV with proper headers (use id param for filename for readability)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="flights-trip-${id}.csv"`,
      },
    });
  } catch (e: any) {
    console.error("Export flights error:", e);
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
