import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";
import { isLegacyNumericId, safeParseUUID } from "@/app/lib/invariants";
import { getFlightsSnapshotServer } from "@/app/lib/domain/flights/getFlightsSnapshot";

export const dynamic = "force-dynamic";

/**
 * POST /api/gameday/[roundId]/flights/microfix
 * 
 * Frictionless flights micro-fix API for GameDay pre-round.
 * 
 * Actions:
 * - MOVE_ME: Move caller to another flight
 * - ADD_TO_MY_FLIGHT: Add another member to caller's flight
 * - REMOVE_FROM_MY_FLIGHT: Remove a member from caller's flight to unassigned
 * - UNDO: Undo a previous action
 * 
 * Request body:
 * {
 *   action: "MOVE_ME" | "ADD_TO_MY_FLIGHT" | "REMOVE_FROM_MY_FLIGHT" | "UNDO",
 *   targetMemberId?: string,   // for ADD/REMOVE/UNDO
 *   toFlightId?: string,        // for MOVE_ME
 *   memberId?: string           // for UNDO
 * }
 * 
 * Response:
 * {
 *   ok: true,
 *   undo?: { action: "UNDO_MOVE", memberId: string, toFlightId: string },
 *   snapshot: FlightsSnapshot
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
    const { action, targetMemberId, toFlightId, memberId } = body as {
      action?: "MOVE_ME" | "ADD_TO_MY_FLIGHT" | "REMOVE_FROM_MY_FLIGHT" | "UNDO";
      targetMemberId?: string;
      toFlightId?: string;
      memberId?: string;
    };

    // Validate action
    if (!action || !["MOVE_ME", "ADD_TO_MY_FLIGHT", "REMOVE_FROM_MY_FLIGHT", "UNDO"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "action must be MOVE_ME, ADD_TO_MY_FLIGHT, REMOVE_FROM_MY_FLIGHT, or UNDO" },
        { status: 400 }
      );
    }

    // Validate required fields
    if (action === "MOVE_ME" && (!toFlightId || typeof toFlightId !== "string")) {
      return NextResponse.json(
        { ok: false, error: "toFlightId is required for MOVE_ME" },
        { status: 400 }
      );
    }

    if ((action === "ADD_TO_MY_FLIGHT" || action === "REMOVE_FROM_MY_FLIGHT") && (!targetMemberId || typeof targetMemberId !== "string")) {
      return NextResponse.json(
        { ok: false, error: "targetMemberId is required for ADD_TO_MY_FLIGHT and REMOVE_FROM_MY_FLIGHT" },
        { status: 400 }
      );
    }

    if (action === "UNDO") {
      if (!memberId || typeof memberId !== "string") {
        return NextResponse.json(
          { ok: false, error: "memberId is required for UNDO" },
          { status: 400 }
        );
      }
      if (!toFlightId || typeof toFlightId !== "string") {
        return NextResponse.json(
          { ok: false, error: "toFlightId is required for UNDO" },
          { status: 400 }
        );
      }
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
      .select("id,coordination_status")
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

    // Check if round is published or completed (defensive block)
    // First check gameday_rounds for published state
    const { data: gamedayData } = await supabase
      .from("gameday_rounds")
      .select("state,published_at")
      .eq("trip_id", tripId)
      .maybeSingle();

    if (gamedayData && (gamedayData.published_at !== null || gamedayData.state === "published")) {
      return NextResponse.json(
        { ok: false, error: "round_locked" },
        { status: 400 }
      );
    }

    // Check if trip coordination_status is completed
    if (tripData.coordination_status === "completed") {
      return NextResponse.json(
        { ok: false, error: "round_locked" },
        { status: 400 }
      );
    }

    // Determine callerFlightId
    const { data: callerFlightSlot, error: callerFlightError } = await supabase
      .from("trip_flight_slots")
      .select("flight_id")
      .eq("member_id", user.id)
      .maybeSingle();

    if (callerFlightError) {
      return NextResponse.json(
        { ok: false, error: "Failed to fetch caller flight" },
        { status: 500 }
      );
    }

    // For UNDO, we still need to check commit gating but might not require callerFlightId
    // However, we need it for commit checking, so let's handle UNDO separately later
    const callerFlightId = callerFlightSlot?.flight_id || null;

    // Pre-round gating: block if callerFlightId has commits
    // For UNDO, we check the flight of the member being undone
    let flightIdToCheck = callerFlightId;

    if (action === "UNDO") {
      // For UNDO, check both the flight the member is currently in AND the destination flight
      const { data: undoMemberSlot } = await supabase
        .from("trip_flight_slots")
        .select("flight_id")
        .eq("member_id", memberId!)
        .maybeSingle();

      if (!undoMemberSlot) {
        return NextResponse.json(
          { ok: false, error: "Member not found in any flight" },
          { status: 400 }
        );
      }

      flightIdToCheck = undoMemberSlot.flight_id;
    }

    // Check commits on source flight (current flight for UNDO, callerFlightId for others)
    if (flightIdToCheck) {
      const { data: commits, error: commitsError } = await supabase
        .from("gameday_hole_commits")
        .select("id")
        .eq("trip_id", tripId)
        .eq("flight_id", flightIdToCheck)
        .limit(1);

      if (commitsError) {
        return NextResponse.json(
          { ok: false, error: "Failed to check commits" },
          { status: 500 }
        );
      }

      if (commits && commits.length > 0) {
        return NextResponse.json(
          { ok: false, error: "flight_has_commits" },
          { status: 400 }
        );
      }
    }

    // For UNDO and MOVE_ME, also check destination flight for commits
    if ((action === "UNDO" || action === "MOVE_ME") && toFlightId) {
      const { data: destCommits, error: destCommitsError } = await supabase
        .from("gameday_hole_commits")
        .select("id")
        .eq("trip_id", tripId)
        .eq("flight_id", toFlightId)
        .limit(1);

      if (destCommitsError) {
        return NextResponse.json(
          { ok: false, error: "Failed to check destination flight commits" },
          { status: 500 }
        );
      }

      if (destCommits && destCommits.length > 0) {
        return NextResponse.json(
          { ok: false, error: "flight_has_commits" },
          { status: 400 }
        );
      }
    }

    // For non-UNDO actions, require callerFlightId
    if (action !== "UNDO" && !callerFlightId) {
      return NextResponse.json(
        { ok: false, error: "not_in_flight" },
        { status: 400 }
      );
    }

    // Ensure unassigned flight exists
    const supabaseService = await createSupabaseServiceClient();

    let { data: unassignedFlight } = await supabaseService
      .from("trip_flights")
      .select("id")
      .eq("trip_id", tripId)
      .eq("is_unassigned", true)
      .maybeSingle();

    if (!unassignedFlight) {
      const { data: newFlight, error: createError } = await supabaseService
        .from("trip_flights")
        .insert({
          trip_id: tripId,
          flight_number: 0,
          is_unassigned: true,
          execution_status: 'not_started',
          start_hole: 1,
        })
        .select("id")
        .single();

      if (createError || !newFlight) {
        return NextResponse.json(
          { ok: false, error: "Failed to create unassigned flight" },
          { status: 500 }
        );
      }

      unassignedFlight = newFlight;
    }

    const unassignedFlightId = unassignedFlight.id;

    // Handle actions
    let undoPayload: { action: "UNDO_MOVE"; memberId: string; toFlightId: string } | undefined;

    if (action === "UNDO") {
      // UNDO: move memberId back to toFlightId
      const { data: memberSlot } = await supabaseService
        .from("trip_flight_slots")
        .select("id, flight_id")
        .eq("member_id", memberId!)
        .maybeSingle();

      if (!memberSlot) {
        return NextResponse.json(
          { ok: false, error: "Member not found" },
          { status: 400 }
        );
      }

      const previousFlightId = memberSlot.flight_id;

      const { error: updateError } = await supabaseService
        .from("trip_flight_slots")
        .update({ flight_id: toFlightId! })
        .eq("id", memberSlot.id);

      if (updateError) {
        return NextResponse.json(
          { ok: false, error: "Failed to undo move" },
          { status: 500 }
        );
      }

      // UNDO doesn't return an undo payload (can't undo an undo)
    } else if (action === "MOVE_ME") {
      // MOVE_ME: move user.id to toFlightId
      const { data: mySlot } = await supabaseService
        .from("trip_flight_slots")
        .select("id, flight_id")
        .eq("member_id", user.id)
        .maybeSingle();

      if (!mySlot) {
        return NextResponse.json(
          { ok: false, error: "Caller not found in flight slots" },
          { status: 400 }
        );
      }

      const previousFlightId = mySlot.flight_id;

      // Validate toFlightId exists
      const { data: targetFlight } = await supabaseService
        .from("trip_flights")
        .select("id")
        .eq("id", toFlightId!)
        .eq("trip_id", tripId)
        .maybeSingle();

      if (!targetFlight) {
        return NextResponse.json(
          { ok: false, error: "Target flight not found" },
          { status: 400 }
        );
      }

      const { error: updateError } = await supabaseService
        .from("trip_flight_slots")
        .update({ flight_id: toFlightId! })
        .eq("id", mySlot.id);

      if (updateError) {
        return NextResponse.json(
          { ok: false, error: "Failed to move member" },
          { status: 500 }
        );
      }

      undoPayload = {
        action: "UNDO_MOVE",
        memberId: user.id,
        toFlightId: previousFlightId,
      };
    } else if (action === "ADD_TO_MY_FLIGHT") {
      // ADD_TO_MY_FLIGHT: move targetMemberId to callerFlightId
      // First verify target exists in trip_flight_slots (part of roster)
      const { data: targetSlot } = await supabaseService
        .from("trip_flight_slots")
        .select("id, flight_id")
        .eq("member_id", targetMemberId!)
        .maybeSingle();

      if (!targetSlot) {
        return NextResponse.json(
          { ok: false, error: "Target member not in roster" },
          { status: 400 }
        );
      }

      const previousFlightId = targetSlot.flight_id;

      // Check if target is already in callerFlightId
      if (targetSlot.flight_id === callerFlightId) {
        return NextResponse.json(
          { ok: false, error: "Member already in your flight" },
          { status: 400 }
        );
      }

      // Enforce max 4 members: check current count
      const { data: currentMembers, error: countError } = await supabaseService
        .from("trip_flight_slots")
        .select("id")
        .eq("flight_id", callerFlightId!);

      if (countError) {
        return NextResponse.json(
          { ok: false, error: "Failed to check flight capacity" },
          { status: 500 }
        );
      }

      const currentCount = currentMembers?.length || 0;
      if (currentCount >= 4) {
        return NextResponse.json(
          { ok: false, error: "flight_full" },
          { status: 409 }
        );
      }

      const { error: updateError } = await supabaseService
        .from("trip_flight_slots")
        .update({ flight_id: callerFlightId! })
        .eq("id", targetSlot.id);

      if (updateError) {
        return NextResponse.json(
          { ok: false, error: "Failed to add member to flight" },
          { status: 500 }
        );
      }

      undoPayload = {
        action: "UNDO_MOVE",
        memberId: targetMemberId!,
        toFlightId: previousFlightId,
      };
    } else if (action === "REMOVE_FROM_MY_FLIGHT") {
      // REMOVE_FROM_MY_FLIGHT: move targetMemberId from callerFlightId to unassigned
      const { data: targetSlot } = await supabaseService
        .from("trip_flight_slots")
        .select("id, flight_id")
        .eq("member_id", targetMemberId!)
        .maybeSingle();

      if (!targetSlot) {
        return NextResponse.json(
          { ok: false, error: "Target member not found" },
          { status: 400 }
        );
      }

      // Verify target is currently in callerFlightId
      if (targetSlot.flight_id !== callerFlightId) {
        return NextResponse.json(
          { ok: false, error: "Target member not in your flight" },
          { status: 400 }
        );
      }

      const previousFlightId = targetSlot.flight_id;

      const { error: updateError } = await supabaseService
        .from("trip_flight_slots")
        .update({ flight_id: unassignedFlightId })
        .eq("id", targetSlot.id);

      if (updateError) {
        return NextResponse.json(
          { ok: false, error: "Failed to remove member from flight" },
          { status: 500 }
        );
      }

      undoPayload = {
        action: "UNDO_MOVE",
        memberId: targetMemberId!,
        toFlightId: previousFlightId,
      };
    }

    // Get updated snapshot
    const snapshot = await getFlightsSnapshotServer(supabaseService, tripId);

    const response: any = {
      ok: true,
      snapshot,
    };

    if (undoPayload) {
      response.undo = undoPayload;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("[microfix] Error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 }
    );
  }
}
