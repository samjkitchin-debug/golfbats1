import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";

/**
 * POST /api/gameday/[roundId]/fix-flight-roster
 * Fix flight roster (REMOVE, REPLACE, or SWAP members)
 * 
 * Request body:
 * {
 *   action: 'REMOVE' | 'REPLACE' | 'SWAP',
 *   targetMemberId: string (uuid), // Member to remove/replace/swap
 *   sourceMemberId?: string (uuid), // For REPLACE: member from unassigned to pull in
 *   swapTargetFlightId?: string (uuid), // For SWAP: flight to swap with
 *   swapTargetMemberId?: string (uuid) // For SWAP: member in target flight to swap with
 * }
 * 
 * Response:
 * {
 *   ok: true
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
    const { action, targetMemberId, sourceMemberId, swapTargetFlightId, swapTargetMemberId } = body as {
      action?: 'REMOVE' | 'REPLACE' | 'SWAP';
      targetMemberId?: string;
      sourceMemberId?: string;
      swapTargetFlightId?: string;
      swapTargetMemberId?: string;
    };

    // Validate request body
    if (!action || !['REMOVE', 'REPLACE', 'SWAP'].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "action must be REMOVE, REPLACE, or SWAP" },
        { status: 400 }
      );
    }

    if (!targetMemberId || typeof targetMemberId !== "string") {
      return NextResponse.json(
        { ok: false, error: "targetMemberId is required" },
        { status: 400 }
      );
    }

    if (action === 'REPLACE' && (!sourceMemberId || typeof sourceMemberId !== "string")) {
      return NextResponse.json(
        { ok: false, error: "sourceMemberId is required for REPLACE" },
        { status: 400 }
      );
    }

    if (action === 'SWAP') {
      if (!swapTargetFlightId || typeof swapTargetFlightId !== "string") {
        return NextResponse.json(
          { ok: false, error: "swapTargetFlightId is required for SWAP" },
          { status: 400 }
        );
      }
      if (!swapTargetMemberId || typeof swapTargetMemberId !== "string") {
        return NextResponse.json(
          { ok: false, error: "swapTargetMemberId is required for SWAP" },
          { status: 400 }
        );
      }
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
    const { data: callerFlightSlot } = await supabase
      .from("trip_flight_slots")
      .select("flight_id")
      .eq("member_id", user.id)
      .maybeSingle();

    const callerFlightId = callerFlightSlot?.flight_id || null;

    if (!callerFlightId) {
      return NextResponse.json(
        { ok: false, error: "Caller not assigned to a flight" },
        { status: 400 }
      );
    }

    // Check if caller flight has any commits (block edits if commits exist)
    const { data: callerCommits } = await supabase
      .from("gameday_hole_commits")
      .select("id")
      .eq("trip_id", tripId)
      .eq("flight_id", callerFlightId)
      .limit(1);

    if (callerCommits && callerCommits.length > 0) {
      return NextResponse.json(
        { ok: false, error: "Cannot edit flight roster: flight has committed holes" },
        { status: 400 }
      );
    }

    // For SWAP: check if target flight has commits (block if commits exist)
    if (action === 'SWAP' && swapTargetFlightId) {
      const { data: targetCommits } = await supabase
        .from("gameday_hole_commits")
        .select("id")
        .eq("trip_id", tripId)
        .eq("flight_id", swapTargetFlightId)
        .limit(1);

      if (targetCommits && targetCommits.length > 0) {
        return NextResponse.json(
          { ok: false, error: "Cannot swap: target flight has committed holes" },
          { status: 400 }
        );
      }
    }

    // Ensure unassigned flight exists for this trip
    const supabaseService = await createSupabaseServiceClient();
    
    let { data: unassignedFlight } = await supabaseService
      .from("trip_flights")
      .select("id")
      .eq("trip_id", tripId)
      .eq("is_unassigned", true)
      .maybeSingle();

    if (!unassignedFlight) {
      // Create unassigned flight
      const { data: newFlight, error: createError } = await supabaseService
        .from("trip_flights")
        .insert({
          trip_id: tripId,
          flight_number: 0, // Unassigned flight uses 0
          is_unassigned: true,
          execution_status: 'not_started',
          start_hole: 1,
        })
        .select("id")
        .single();

      if (createError || !newFlight) {
        console.error("[fix-flight-roster] Failed to create unassigned flight:", createError);
        return NextResponse.json(
          { ok: false, error: "Failed to create unassigned flight" },
          { status: 500 }
        );
      }

      unassignedFlight = newFlight;
    }

    const unassignedFlightId = unassignedFlight.id;

    // Perform the requested action
    if (action === 'REMOVE') {
      // Move targetMemberId from caller flight to unassigned flight
      // First, check if member is in caller flight
      const { data: targetSlot } = await supabaseService
        .from("trip_flight_slots")
        .select("id,flight_id")
        .eq("member_id", targetMemberId)
        .maybeSingle();

      if (!targetSlot || targetSlot.flight_id !== callerFlightId) {
        return NextResponse.json(
          { ok: false, error: "Target member not in caller's flight" },
          { status: 400 }
        );
      }

      // Update slot to unassigned flight
      const { error: updateError } = await supabaseService
        .from("trip_flight_slots")
        .update({ flight_id: unassignedFlightId })
        .eq("id", targetSlot.id);

      if (updateError) {
        console.error("[fix-flight-roster] Failed to remove member:", updateError);
        return NextResponse.json(
          { ok: false, error: "Failed to remove member from flight" },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    if (action === 'REPLACE') {
      // Remove targetMemberId from caller flight to unassigned
      // Add sourceMemberId from unassigned to caller flight
      
      // Check target is in caller flight
      const { data: targetSlot } = await supabaseService
        .from("trip_flight_slots")
        .select("id,flight_id")
        .eq("member_id", targetMemberId)
        .maybeSingle();

      if (!targetSlot || targetSlot.flight_id !== callerFlightId) {
        return NextResponse.json(
          { ok: false, error: "Target member not in caller's flight" },
          { status: 400 }
        );
      }

      // Check source is in unassigned flight
      const { data: sourceSlot } = await supabaseService
        .from("trip_flight_slots")
        .select("id,flight_id")
        .eq("member_id", sourceMemberId)
        .maybeSingle();

      if (!sourceSlot || sourceSlot.flight_id !== unassignedFlightId) {
        return NextResponse.json(
          { ok: false, error: "Source member not in unassigned flight" },
          { status: 400 }
        );
      }

      // Update both slots
      const { error: removeError } = await supabaseService
        .from("trip_flight_slots")
        .update({ flight_id: unassignedFlightId })
        .eq("id", targetSlot.id);

      if (removeError) {
        console.error("[fix-flight-roster] Failed to remove target member:", removeError);
        return NextResponse.json(
          { ok: false, error: "Failed to remove target member" },
          { status: 500 }
        );
      }

      const { error: addError } = await supabaseService
        .from("trip_flight_slots")
        .update({ flight_id: callerFlightId })
        .eq("id", sourceSlot.id);

      if (addError) {
        console.error("[fix-flight-roster] Failed to add source member:", addError);
        // Try to rollback target removal
        await supabaseService
          .from("trip_flight_slots")
          .update({ flight_id: callerFlightId })
          .eq("id", targetSlot.id);
        return NextResponse.json(
          { ok: false, error: "Failed to add source member" },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    if (action === 'SWAP') {
      // Swap targetMemberId (in caller flight) with swapTargetMemberId (in swapTargetFlightId)
      
      // Check target is in caller flight
      const { data: targetSlot } = await supabaseService
        .from("trip_flight_slots")
        .select("id,flight_id")
        .eq("member_id", targetMemberId)
        .maybeSingle();

      if (!targetSlot || targetSlot.flight_id !== callerFlightId) {
        return NextResponse.json(
          { ok: false, error: "Target member not in caller's flight" },
          { status: 400 }
        );
      }

      // Check swap target is in swapTargetFlightId
      const { data: swapTargetSlot } = await supabaseService
        .from("trip_flight_slots")
        .select("id,flight_id")
        .eq("member_id", swapTargetMemberId)
        .maybeSingle();

      if (!swapTargetSlot || swapTargetSlot.flight_id !== swapTargetFlightId) {
        return NextResponse.json(
          { ok: false, error: "Swap target member not in specified flight" },
          { status: 400 }
        );
      }

      // Swap flights: target goes to swapTargetFlightId, swapTarget goes to callerFlightId
      const { error: swap1Error } = await supabaseService
        .from("trip_flight_slots")
        .update({ flight_id: swapTargetFlightId })
        .eq("id", targetSlot.id);

      if (swap1Error) {
        console.error("[fix-flight-roster] Failed to swap target member:", swap1Error);
        return NextResponse.json(
          { ok: false, error: "Failed to swap members" },
          { status: 500 }
        );
      }

      const { error: swap2Error } = await supabaseService
        .from("trip_flight_slots")
        .update({ flight_id: callerFlightId })
        .eq("id", swapTargetSlot.id);

      if (swap2Error) {
        console.error("[fix-flight-roster] Failed to swap target member:", swap2Error);
        // Try to rollback first swap
        await supabaseService
          .from("trip_flight_slots")
          .update({ flight_id: callerFlightId })
          .eq("id", targetSlot.id);
        return NextResponse.json(
          { ok: false, error: "Failed to swap members" },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    // Should never reach here
    return NextResponse.json(
      { ok: false, error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Fix flight roster error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
