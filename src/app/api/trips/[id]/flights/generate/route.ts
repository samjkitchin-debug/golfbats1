import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";
import { requireAuthedUser, isGroupAdmin } from "@/app/lib/serverAuth";
import { getEffectiveTripTimelinePhase } from "@/app/lib/tripDates";
import { generateQuartileFlights } from "@/app/lib/flightGenerator";

/**
 * POST /api/trips/[id]/flights/generate
 * 
 * Generate flights for a trip (quartile grouping).
 * 
 * HARD RULE: Flights can ONLY be generated after signups are closed.
 * Group trips: only group admins can generate (no host bypass).
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
    const { id } = await params;

    // Invariant: Route param [id] may be legacy numeric id or UUID. We always resolve to canonical trips.id (UUID) before role checks and mutations.
    const isNumeric = /^[0-9]+$/.test(id);
    const parsed = isNumeric ? Number(id) : null;
    let tripQuery = supabase
      .from("trips")
      .select("id,legacy_id,group_id,trip_date,cutoff_at,status,signups_opened_at")
      .limit(1);
    tripQuery = isNumeric ? tripQuery.eq("legacy_id", parsed) : tripQuery.eq("id", id);
    const { data: tripData, error: tripErr } = await tripQuery.maybeSingle();

    if (tripErr || !tripData) {
      return NextResponse.json(
        { error: "Trip not found." },
        { status: 404 }
      );
    }

    const tripUuid = tripData.id;
    const groupId = tripData.group_id;

    let userId: string;
    try {
      const auth = await requireAuthedUser();
      userId = auth.userId;
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "UNAUTHORIZED") {
        return NextResponse.json({ error: "Not signed in." }, { status: 401 });
      }
      throw e;
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;

    const userIsAdmin = await isGroupAdmin({ supabase, userId, groupId });
    if (!userIsAdmin) {
      return NextResponse.json(
        { error: "Only group admins can generate flights." },
        { status: 403 }
      );
    }

    // HARD RULE: Check phase - flights can ONLY be generated after signups close (use resolved trip row only)
    const tripLike = {
      status: tripData.status,
      date: tripData.trip_date,
      cutoffAt: tripData.cutoff_at ?? undefined,
      signupsOpenedAt: (tripData as { signups_opened_at?: string }).signups_opened_at ?? undefined,
    };
    const phase = getEffectiveTripTimelinePhase(tripLike as Parameters<typeof getEffectiveTripTimelinePhase>[0]);

    if (phase !== "signupsClosed") {
      return NextResponse.json(
        { error: "Flights can only be generated after signups close." },
        { status: 403 }
      );
    }

    const supabaseService = await createSupabaseServiceClient();

    // Fetch all attendees; filter in code with same predicate as trip UI (Join writes "confirmed")
    const { data: attendeesData, error: attendeesErr } = await supabaseService
      .from("trip_attendees")
      .select("member_id,status,joined_at,handicap_snapshot")
      .eq("trip_id", tripUuid);

    if (attendeesErr) {
      console.error("Failed to fetch attendees:", attendeesErr);
      return NextResponse.json(
        { error: "Failed to fetch attendees." },
        { status: 500 }
      );
    }

    const confirmedRows = (attendeesData || []).filter((r) => r.status === "confirmed");

    console.info("[flights/generate] attendees fetch", {
      tripUuid,
      routeParamId: id,
      attendeesFetchCount: (attendeesData || []).length,
      attendeesList: (attendeesData || []).map((a) => ({ member_id: a.member_id, status: a.status })),
      confirmedRowsLength: confirmedRows.length,
      confirmedRowsMemberIds: confirmedRows.map((r) => r.member_id),
    });

    const memberIds = Array.from(
      new Set(confirmedRows.map((a) => a.member_id).filter(Boolean))
    );
    const membersById = {} as Record<string, { display_name: string | null; full_name: string | null }>;
    if (memberIds.length > 0) {
      const { data: membersData, error: membersErr } = await supabaseService
        .from("members")
        .select("id,display_name,full_name")
        .in("id", memberIds);

      if (membersErr) {
        console.warn("[flights/generate] Failed to fetch members:", membersErr);
      } else if (membersData) {
        for (const m of membersData) {
          membersById[m.id] = { display_name: m.display_name, full_name: m.full_name };
        }
      }
    }

    const attendees = confirmedRows.map((a) => {
      const m = membersById[a.member_id];
      const name = m?.display_name || m?.full_name || "Unknown";
      return {
        name,
        status: "confirmed" as const,
        joinedAt: a.joined_at ? new Date(a.joined_at).getTime() : Date.now(),
        handicapForTrip: a.handicap_snapshot ?? null,
        memberId: a.member_id,
      };
    });

    const confirmedCount = confirmedRows.length;
    console.info("[flights/generate] mapped attendees", {
      tripUuid,
      mappedAttendeesCount: attendees.length,
      mappedMemberIds: attendees.map((a) => a.memberId),
    });

    const { data: existingFlightsWithSlots, error: existingErr } = await supabaseService
      .from("trip_flights")
      .select("id, trip_flight_slots(id, member_id)")
      .eq("trip_id", tripUuid);

    if (existingErr) {
      console.error("[flights/generate] Failed to load existing flights:", existingErr);
    }

    const existingFlights = existingFlightsWithSlots || [];
    const existingSlotCount = existingFlights.reduce(
      (sum: number, f: { trip_flight_slots?: unknown[] }) => sum + (f.trip_flight_slots || []).length,
      0
    );
    const existingFlightCount = existingFlights.length;

    if (existingFlightCount > 0 && existingSlotCount === confirmedCount && !force) {
      console.info("[flights/generate] Reusing existing flights (counts match)", {
        tripId: tripUuid,
        confirmedCount,
        existingSlotCount,
        existingFlightCount,
      });
      return NextResponse.json({
        ok: true,
        flightsGenerated: existingFlightCount,
        excludedMembers: [],
        confirmedAttendeesCount: confirmedCount,
        generatedSlotsCount: existingSlotCount,
      });
    }

    if (existingFlightCount > 0 && (existingSlotCount !== confirmedCount || force)) {
      if (existingSlotCount !== confirmedCount) {
        console.warn("[flights/generate] Existing flights invalid (count mismatch) - regenerating", {
          tripId: tripUuid,
          confirmedCount,
          existingSlotCount,
          existingFlightCount,
        });
      }
      const flightIds = existingFlights.map((f: { id: string }) => f.id);
      const { error: deleteErr } = await supabaseService
        .from("trip_flight_slots")
        .delete()
        .in("flight_id", flightIds);

      if (deleteErr) {
        console.error("Failed to delete existing flight slots:", deleteErr);
        return NextResponse.json(
          { error: "Failed to delete existing flights." },
          { status: 500 }
        );
      }

      const { error: deleteFlightsErr } = await supabaseService
        .from("trip_flights")
        .delete()
        .eq("trip_id", tripUuid);

      if (deleteFlightsErr) {
        console.error("Failed to delete existing flights:", deleteFlightsErr);
        return NextResponse.json(
          { error: "Failed to delete existing flights." },
          { status: 500 }
        );
      }
    }

    const result = generateQuartileFlights(attendees, 4);
    const generatedSlotCount = result.flights.reduce(
      (sum, flight) => sum + flight.slots.length,
      0
    );
    console.info("[flights/generate] generated flights summary", {
      tripUuid,
      flights: result.flights.map((f) => ({
        flightNumber: f.flightNumber,
        slots: f.slots.map((s) => ({ memberId: s.memberId, slotPosition: s.slotPosition })),
      })),
      generatedSlotCount,
      expectedCount: confirmedRows.length,
    });
    if (generatedSlotCount !== confirmedCount) {
      console.warn("[flights/generate] ATTENDEE_SLOT_MISMATCH", {
        tripId: tripUuid,
        confirmedAttendees: confirmedCount,
        generatedSlots: generatedSlotCount,
        attendeeIds: attendees.map((a) => a.memberId),
        slotMemberIds: result.flights.flatMap((f) => f.slots.map((s) => s.memberId)),
      });
    }

    // Insert flights and slots via service client (canonical trip UUID; explicit defaults for robustness)
    for (const flight of result.flights) {
      const flightInsert = {
        trip_id: tripUuid,
        flight_number: flight.flightNumber,
        execution_status: "not_started",
        start_hole: 1,
        is_unassigned: false,
      };
      const { data: flightData, error: flightErr } = await supabaseService
        .from("trip_flights")
        .insert(flightInsert)
        .select("id")
        .single();

      if (flightErr || !flightData) {
        console.error("[flights/generate] trip_flights insert result", {
          payload: flightInsert,
          error: flightErr
            ? {
                message: flightErr.message,
                code: (flightErr as { code?: string }).code,
                details: (flightErr as { details?: string }).details,
                hint: (flightErr as { hint?: string }).hint,
              }
            : null,
          data: flightData ?? null,
        });
        return NextResponse.json(
          { error: "Failed to create flight." },
          { status: 500 }
        );
      }

      // slot_position must be unique per (flight_id, slot_position) constraint; use generator value or idx+1
      for (let idx = 0; idx < flight.slots.length; idx++) {
        const slot = flight.slots[idx];
        const slot_position =
          (slot as { slotPosition?: number }).slotPosition != null
            ? (slot as { slotPosition: number }).slotPosition
            : idx + 1;

        console.info("[flights/generate] INSERT_SLOT_ATTEMPT", {
          flightId: flightData.id,
          flightNumber: flight.flightNumber,
          memberId: slot.memberId,
          slot_position,
        });

        const { error: slotErr } = await supabaseService
          .from("trip_flight_slots")
          .insert({
            flight_id: flightData.id,
            member_id: slot.memberId,
            slot_position,
            is_locked: false,
          });

        if (slotErr) {
          const errObj = slotErr as { code?: string; message?: string; details?: string; hint?: string };
          console.error("[flights/generate] INSERT_SLOT_FAILED", {
            code: errObj.code,
            message: errObj.message,
            details: errObj.details,
            hint: errObj.hint,
            flightNumber: flight.flightNumber,
            memberId: slot.memberId,
            slot_position,
          });
          // Cleanup: delete all flights for this trip (cascade to slots) so we never leave partial state
          const { data: flightsToDelete } = await supabaseService
            .from("trip_flights")
            .select("id")
            .eq("trip_id", tripUuid);
          const flightIds = (flightsToDelete || []).map((f: { id: string }) => f.id);
          if (flightIds.length > 0) {
            await supabaseService.from("trip_flight_slots").delete().in("flight_id", flightIds);
            await supabaseService.from("trip_flights").delete().eq("trip_id", tripUuid);
          }
          return NextResponse.json(
            {
              error: "Failed to create flight slot.",
              details: {
                code: errObj.code,
                message: errObj.message,
                details: errObj.details,
                hint: errObj.hint,
                flightNumber: flight.flightNumber,
                memberId: slot.memberId,
                slot_position,
              },
            },
            { status: 500 }
          );
        }
      }
    }

    // Post-write invariant: re-check slot count; never leave partial state on mismatch
    const expectedSlots = confirmedRows.length;
    const { data: flightsWithSlotsAfter, error: countErr } = await supabaseService
      .from("trip_flights")
      .select("id, trip_flight_slots(id, member_id)")
      .eq("trip_id", tripUuid);
    if (countErr) {
      console.error("[flights/generate] Failed to re-read flights for invariant:", countErr);
      const { data: flightsToDelete } = await supabaseService
        .from("trip_flights")
        .select("id")
        .eq("trip_id", tripUuid);
      const ids = (flightsToDelete || []).map((f: { id: string }) => f.id);
      if (ids.length > 0) {
        await supabaseService.from("trip_flight_slots").delete().in("flight_id", ids);
        await supabaseService.from("trip_flights").delete().eq("trip_id", tripUuid);
      }
      return NextResponse.json(
        { error: "Flights generation invariant failed (slot count mismatch)." },
        { status: 500 }
      );
    }
    const actualSlots = (flightsWithSlotsAfter || []).reduce(
      (sum: number, f: { trip_flight_slots?: unknown[] }) => sum + (f.trip_flight_slots || []).length,
      0
    );
    if (actualSlots !== expectedSlots) {
      const slotMemberIds = (flightsWithSlotsAfter || []).flatMap(
        (f: { trip_flight_slots?: { member_id: string }[] }) =>
          (f.trip_flight_slots || []).map((s) => s.member_id)
      );
      console.error("[flights/generate] FLIGHTS_GENERATION_INVARIANT_FAILED", {
        expectedSlots,
        actualSlots,
        slotMemberIds,
      });
      const flightIds = (flightsWithSlotsAfter || []).map((f: { id: string }) => f.id);
      if (flightIds.length > 0) {
        await supabaseService.from("trip_flight_slots").delete().in("flight_id", flightIds);
        await supabaseService.from("trip_flights").delete().eq("trip_id", tripUuid);
      }
      return NextResponse.json(
        { error: "Flights generation invariant failed (slot count mismatch)." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      flightsGenerated: result.flights.length,
      excludedMembers: result.excludedMembers,
      confirmedAttendeesCount: confirmedCount,
      generatedSlotsCount: generatedSlotCount,
    });
  } catch (e: any) {
    console.error("Generate flights error:", e);
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
