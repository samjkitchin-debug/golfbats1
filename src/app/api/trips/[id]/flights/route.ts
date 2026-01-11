import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

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

    // Fetch flights with slots (use UUID id)
    const { data: flightsData, error: flightsErr } = await supabase
      .from("trip_flights")
      .select(`
        id,
        flight_number,
        trip_flight_slots(
          id,
          member_id,
          slot_position,
          is_locked,
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

    // Transform to UI format
    const flights = (flightsData || []).map((f: any) => ({
      id: f.id,
      flightNumber: f.flight_number,
      slots: (f.trip_flight_slots || [])
        .sort((a: any, b: any) => a.slot_position - b.slot_position)
        .map((slot: any) => {
          const member = Array.isArray(slot.members) ? slot.members[0] : slot.members;
          return {
            id: slot.id,
            memberId: slot.member_id,
            memberName: member?.display_name || member?.full_name || "Unknown",
            slotPosition: slot.slot_position,
            isLocked: slot.is_locked,
          };
        }),
    }));

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

    // Fetch trip UUID id from legacy_id and check if user is admin
    const { data: tripData } = await supabase
      .from("trips")
      .select("id,group_id")
      .eq("legacy_id", tripId)
      .maybeSingle();

    if (!tripData) {
      return NextResponse.json(
        { error: "Trip not found." },
        { status: 404 }
      );
    }

    const { data: membership } = await supabase
      .from("group_members")
      .select("is_admin")
      .eq("group_id", tripData.group_id)
      .eq("member_id", user.id)
      .maybeSingle();

    if (!membership?.is_admin) {
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

    // Apply updates
    for (const update of updates) {
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
        continue; // Skip empty updates
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
