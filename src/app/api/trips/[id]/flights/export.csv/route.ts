import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

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
    const resolvedParams = await params;
    const tripId = parseInt(resolvedParams.id, 10);

    if (!Number.isFinite(tripId)) {
      return NextResponse.json(
        { error: "Invalid trip ID." },
        { status: 400 }
      );
    }

    // Get authenticated user
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    // Fetch trip UUID id from legacy_id
    const { data: tripData } = await supabase
      .from("trips")
      .select("id")
      .eq("legacy_id", tripId)
      .maybeSingle();

    if (!tripData) {
      return NextResponse.json(
        { error: "Trip not found." },
        { status: 404 }
      );
    }

    // Fetch flights with slots and member names (use UUID id)
    const { data: flightsData, error: flightsErr } = await supabase
      .from("trip_flights")
      .select(`
        flight_number,
        trip_flight_slots(
          slot_position,
          members(display_name, full_name)
        )
      `)
      .eq("trip_id", tripData.id)
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

    // Return CSV with proper headers
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="flights-trip-${tripId}.csv"`,
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
