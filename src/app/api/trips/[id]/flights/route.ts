import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";
import { requireAuthedUser, isGroupAdmin } from "@/app/lib/serverAuth";

/**
 * GET /api/trips/[id]/flights
 * 
 * Fetch flights for a trip.
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
    let tripQuery = supabase.from("trips").select("id, group_id").limit(1);
    tripQuery = isNumeric ? tripQuery.eq("legacy_id", parsed) : tripQuery.eq("id", id);
    const { data: tripData, error: tripErr } = await tripQuery.maybeSingle();

    if (tripErr || !tripData) {
      return NextResponse.json(
        { error: "Trip not found." },
        { status: 404 }
      );
    }

    const tripUuid = tripData.id;
    const groupId = (tripData as { group_id?: string }).group_id ?? null;

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

    const userIsAdmin = groupId ? await isGroupAdmin({ supabase, userId, groupId }) : false;
    if (!userIsAdmin) {
      const { data: attendeeRow } = await supabase
        .from("trip_attendees")
        .select("member_id")
        .eq("trip_id", tripUuid)
        .eq("member_id", userId)
        .maybeSingle();
      if (!attendeeRow) {
        return NextResponse.json(
          { error: "Only attendees can view flights." },
          { status: 403 }
        );
      }
    }

    const supabaseService = await createSupabaseServiceClient();

    const { data: flightsData, error: flightsErr } = await supabaseService
      .from("trip_flights")
      .select(`
        id,
        flight_number,
        execution_status,
        started_at,
        finished_at,
        start_hole,
        trip_flight_slots(
          id,
          member_id,
          slot_position,
          is_locked,
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

    const memberIds = Array.from(
      new Set(
        (flightsData || [])
          .flatMap((f: any) => (f.trip_flight_slots || []).map((s: any) => s.member_id))
          .filter(Boolean)
      )
    );
    const handicapByMemberId: Record<string, number | null> = {};
    if (memberIds.length > 0) {
      const { data: taData, error: taErr } = await supabaseService
        .from("trip_attendees")
        .select("member_id, handicap_snapshot")
        .eq("trip_id", tripUuid)
        .in("member_id", memberIds);

      if (taErr) {
        console.warn("[flights] Failed to fetch handicap snapshots:", taErr);
      } else {
        (taData || []).forEach((r: any) => {
          handicapByMemberId[r.member_id] = r.handicap_snapshot ?? null;
        });
      }
    }

    // Transform to UI format
    const flights = (flightsData || []).map((f: any) => ({
      id: f.id,
      flightNumber: f.flight_number,
      executionStatus: f.execution_status ?? "not_started",
      startedAt: f.started_at ?? null,
      finishedAt: f.finished_at ?? null,
      startHole: f.start_hole ?? 1,
      slots: (f.trip_flight_slots || [])
        .sort((a: any, b: any) => a.slot_position - b.slot_position)
        .map((slot: any) => {
          const member = Array.isArray(slot.members) ? slot.members[0] : slot.members;
          return {
            id: slot.id,
            memberId: slot.member_id,
            memberName: member?.display_name || member?.full_name || "Unknown",
            handicapSnapshot: handicapByMemberId[slot.member_id] ?? null,
            slotPosition: slot.slot_position,
            isLocked: slot.is_locked,
          };
        }),
    }));

    const totalSlots = flights.reduce((sum, f) => sum + f.slots.length, 0);
    console.info("[flights/get] slots_returned", { tripId: tripUuid, slots: totalSlots });

    return NextResponse.json({ flights });
  } catch (e: any) {
    console.error("Fetch flights error:", e);
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/trips/[id]/flights
 * 
 * Update flight slots (swaps, moves, locks).
 * Never regenerates implicitly.
 * 
 * Body:
 * - updates: Array<{ slotId: string, memberId?: string, slotPosition?: number, isLocked?: boolean }>
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { id } = await params;

    // Invariant: Route param [id] may be legacy numeric id or UUID. We always resolve to canonical trips.id (UUID) before role checks and mutations.
    const isNumeric = /^[0-9]+$/.test(id);
    const parsed = isNumeric ? Number(id) : null;
    let tripQuery = supabase.from("trips").select("id,group_id").limit(1);
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

    const userIsAdmin = groupId ? await isGroupAdmin({ supabase, userId, groupId }) : false;
    if (!userIsAdmin) {
      return NextResponse.json(
        { error: "Only group admins can update flights." },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const updates = body.updates || [];

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "Invalid updates array." },
        { status: 400 }
      );
    }

    // Apply updates (validate slot ownership first: slotId → flight → trip_id === tripUuid)
    for (const update of updates) {
      const { data: slotRow, error: slotErr } = await supabase
        .from("trip_flight_slots")
        .select("id,flight_id")
        .eq("id", update.slotId)
        .maybeSingle();

      if (slotErr || !slotRow) {
        return NextResponse.json(
          { error: "Not found." },
          { status: 404 }
        );
      }

      const { data: flightRow, error: flightErr } = await supabase
        .from("trip_flights")
        .select("id,trip_id")
        .eq("id", (slotRow as { flight_id: string }).flight_id)
        .maybeSingle();

      if (flightErr || !flightRow) {
        return NextResponse.json(
          { error: "Not found." },
          { status: 404 }
        );
      }

      if ((flightRow as { trip_id: string }).trip_id !== tripUuid) {
        return NextResponse.json(
          { error: "Not found." },
          { status: 404 }
        );
      }

      const updatePayload: any = {};
      if (update.memberId !== undefined) {
        updatePayload.member_id = update.memberId;
      }
      if (update.slotPosition !== undefined) {
        updatePayload.slot_position = update.slotPosition;
      }
      if (update.isLocked !== undefined) {
        updatePayload.is_locked = update.isLocked;
      }
      if (Object.keys(updatePayload).length === 0) {
        continue;
      }

      const { error: updateErr } = await supabase
        .from("trip_flight_slots")
        .update(updatePayload)
        .eq("id", update.slotId);

      if (updateErr) {
        console.error("Failed to update flight slot:", updateErr);
        return NextResponse.json(
          { error: `Failed to update slot ${update.slotId}.` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Update flights error:", e);
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
