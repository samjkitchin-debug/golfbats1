import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { getEffectiveTripPhase } from "@/app/lib/tripDates";
import { generateQuartileFlights } from "@/app/lib/flightGenerator";
import { loadTrips } from "@/app/lib/tripActions";

/**
 * POST /api/trips/[id]/flights/generate
 * 
 * Generate flights for a trip (quartile grouping).
 * 
 * HARD RULE: Flights can ONLY be generated after signups are closed.
 * 
 * Body:
 * - force?: boolean - If true, regenerate even if flights exist (requires confirmation)
 */
export async function POST(
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

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;

    // Fetch trip data by legacy_id (numeric ID from URL)
    const { data: tripData, error: tripErr } = await supabase
      .from("trips")
      .select("id,legacy_id,group_id,trip_date,cutoff_at,status,scenario_key")
      .eq("legacy_id", tripId)
      .maybeSingle();

    if (tripErr || !tripData) {
      return NextResponse.json(
        { error: "Trip not found." },
        { status: 404 }
      );
    }

    // Check if user is admin of the trip's group
    const { data: membership } = await supabase
      .from("group_members")
      .select("is_admin")
      .eq("group_id", tripData.group_id)
      .eq("member_id", user.id)
      .maybeSingle();

    if (!membership?.is_admin) {
      return NextResponse.json(
        { error: "Only group admins can generate flights." },
        { status: 403 }
      );
    }

    // HARD RULE: Check phase - flights can ONLY be generated after signups close
    const trips = await loadTrips(tripData.group_id, true);
    const trip = trips.find((t) => t.id === tripId);
    
    if (!trip) {
      return NextResponse.json(
        { error: "Trip not found." },
        { status: 404 }
      );
    }

    const phase = getEffectiveTripPhase(trip);
    
    if (phase !== "signupsClosed") {
      return NextResponse.json(
        { error: "Flights can only be generated after signups close." },
        { status: 409 }
      );
    }

    // Use UUID id for foreign key references
    const tripUuidId = tripData.id;

    // Check if flights already exist
    const { data: existingFlights } = await supabase
      .from("trip_flights")
      .select("id")
      .eq("trip_id", tripUuidId);

    if (existingFlights && existingFlights.length > 0 && !force) {
      return NextResponse.json(
        { error: "Flights already exist. Use force=true to regenerate." },
        { status: 409 }
      );
    }

    // Fetch confirmed attendees with handicaps (use UUID id)
    const { data: attendeesData, error: attendeesErr } = await supabase
      .from("trip_attendees")
      .select(`
        member_id,
        status,
        handicap_snapshot,
        members!inner(display_name, full_name)
      `)
      .eq("trip_id", tripUuidId)
      .eq("status", "confirmed");

    if (attendeesErr) {
      console.error("Failed to fetch attendees:", attendeesErr);
      return NextResponse.json(
        { error: "Failed to fetch attendees." },
        { status: 500 }
      );
    }

    // Transform to Attendee format for generator
    const attendees = (attendeesData || []).map((a: any) => ({
      name: a.members?.display_name || a.members?.full_name || "Unknown",
      status: "confirmed" as const,
      joinedAt: Date.now(),
      handicapForTrip: a.handicap_snapshot ?? null,
      memberId: a.member_id,
    }));

    // Generate flights
    const result = generateQuartileFlights(attendees, 4);

    // Start transaction: delete existing flights if regenerating, then insert new ones
    if (force && existingFlights && existingFlights.length > 0) {
      // Delete existing flight slots first (CASCADE will handle flights)
      const { error: deleteErr } = await supabase
        .from("trip_flight_slots")
        .delete()
        .in(
          "flight_id",
          existingFlights.map((f) => f.id)
        );

      if (deleteErr) {
        console.error("Failed to delete existing flight slots:", deleteErr);
        return NextResponse.json(
          { error: "Failed to delete existing flights." },
          { status: 500 }
        );
      }

      // Delete existing flights (use UUID id)
      const { error: deleteFlightsErr } = await supabase
        .from("trip_flights")
        .delete()
        .eq("trip_id", tripUuidId);

      if (deleteFlightsErr) {
        console.error("Failed to delete existing flights:", deleteFlightsErr);
        return NextResponse.json(
          { error: "Failed to delete existing flights." },
          { status: 500 }
        );
      }
    }

    // Insert flights and slots
    for (const flight of result.flights) {
      // Insert flight (use UUID id)
      const { data: flightData, error: flightErr } = await supabase
        .from("trip_flights")
        .insert({
          trip_id: tripUuidId,
          flight_number: flight.flightNumber,
        })
        .select("id")
        .single();

      if (flightErr || !flightData) {
        console.error("Failed to insert flight:", flightErr);
        return NextResponse.json(
          { error: "Failed to create flight." },
          { status: 500 }
        );
      }

      // Insert slots for this flight
      for (const slot of flight.slots) {
        const { error: slotErr } = await supabase
          .from("trip_flight_slots")
          .insert({
            flight_id: flightData.id,
            member_id: slot.memberId,
            slot_position: slot.slotPosition,
            is_locked: false,
          });

        if (slotErr) {
          console.error("Failed to insert flight slot:", slotErr);
          return NextResponse.json(
            { error: "Failed to create flight slot." },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({
      ok: true,
      flightsGenerated: result.flights.length,
      excludedMembers: result.excludedMembers,
    });
  } catch (e: any) {
    console.error("Generate flights error:", e);
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
