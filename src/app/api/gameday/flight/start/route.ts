import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";

/**
 * POST /api/gameday/flight/start
 * Starts a flight execution (updates trip_flights.execution_status)
 * Any participant assigned to the flight can start it.
 * Also ensures trip-level gameday_rounds is in_progress.
 * 
 * Body:
 * {
 *   flightId: string  // UUID
 * }
 * 
 * Response:
 * {
 *   ok: true,
 *   tripId: string,
 *   flightId: string,
 *   executionStatus: 'in_progress'
 * }
 * 
 * Errors:
 * - 401: Unauthorized
 * - 403: User is not assigned to this flight or not a group member
 * - 404: Flight not found
 * - 409: Flight already finished (reason: 'flight_finished')
 * - 500: Server error
 */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { flightId } = body as { flightId?: string };

    if (!flightId || typeof flightId !== "string") {
      return NextResponse.json(
        { ok: false, error: "flightId is required" },
        { status: 400 }
      );
    }

    // Get current member ID - in canonical schema: members.id == auth.user.id
    const { data: memberData } = await supabase
      .from("members")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!memberData) {
      return NextResponse.json(
        { ok: false, error: "member_not_found" },
        { status: 403 }
      );
    }

    const memberId = memberData.id;

    // Fetch the flight row joined to its trip to get trip_id + group_id
    const { data: flightData, error: flightError } = await supabase
      .from("trip_flights")
      .select(`
        id,
        trip_id,
        execution_status,
        started_at,
        started_by_member_id,
        trips!inner(
          id,
          group_id
        )
      `)
      .eq("id", flightId)
      .single();

    if (flightError || !flightData) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 }
      );
    }

    const tripId = (flightData as any).trips.id;
    const groupId = (flightData as any).trips.group_id;

    // Verify the user is allowed to start THIS flight:
    // 1) They must be a member of the trip's group
    const { data: groupMemberData } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .eq("status", "approved")
      .maybeSingle();

    if (!groupMemberData) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }

    // 2) They must be assigned to this flight (via trip_flight_slots)
    const { data: flightSlotData } = await supabase
      .from("trip_flight_slots")
      .select("id")
      .eq("flight_id", flightId)
      .eq("member_id", memberId)
      .maybeSingle();

    if (!flightSlotData) {
      return NextResponse.json(
        { ok: false, error: "not_assigned_to_flight" },
        { status: 403 }
      );
    }

    // Check current execution status
    const currentStatus = flightData.execution_status;

    // If already finished, return 409
    if (currentStatus === 'finished') {
      return NextResponse.json(
        { ok: false, reason: "flight_finished" },
        { status: 409 }
      );
    }

    // If already in_progress, return success (idempotent)
    if (currentStatus === 'in_progress') {
      // Still ensure trip-level gameday_rounds is in_progress
      await ensureTripGamedayInProgress(supabase, tripId, user.id);
      
      return NextResponse.json({
        ok: true,
        tripId,
        flightId,
        executionStatus: 'in_progress',
      });
    }

    const now = new Date().toISOString();

    // Update flight execution status
    let updateData: any = {
      execution_status: 'in_progress',
      updated_at: now,
    };

    // Set started_at if not already set
    if (!flightData.started_at) {
      updateData.started_at = now;
    }

    // Set started_by_member_id if not already set
    if (!flightData.started_by_member_id) {
      updateData.started_by_member_id = memberId;
    }

    // Try with regular client first
    const { data: updatedFlight, error: updateError } = await supabase
      .from("trip_flights")
      .update(updateData)
      .eq("id", flightId)
      .select("id,execution_status,trip_id")
      .single();

    // If RLS blocks, use service client
    if (updateError && updateError.code === "42501") {
      const supabaseService = await createSupabaseServiceClient();
      const { data: serviceFlight, error: serviceError } = await supabaseService
        .from("trip_flights")
        .update(updateData)
        .eq("id", flightId)
        .select("id,execution_status")
        .single();

      if (serviceError || !serviceFlight) {
        console.error("[gameday/flight/start] Service client update error:", serviceError);
        return NextResponse.json(
          { ok: false, error: serviceError?.message || "Failed to start flight" },
          { status: 500 }
        );
      }

      // Ensure trip-level gameday_rounds is in_progress
      await ensureTripGamedayInProgress(supabaseService, tripId, user.id);

      return NextResponse.json({
        ok: true,
        tripId,
        flightId: serviceFlight.id,
        executionStatus: serviceFlight.execution_status,
      });
    }

    if (updateError || !updatedFlight) {
      console.error("[gameday/flight/start] Update error:", updateError);
      return NextResponse.json(
        { ok: false, error: updateError?.message || "Failed to start flight" },
        { status: 500 }
      );
    }

    // Ensure trip-level gameday_rounds is in_progress
    await ensureTripGamedayInProgress(supabase, tripId, user.id);

    return NextResponse.json({
      ok: true,
      tripId,
      flightId: updatedFlight.id,
      executionStatus: updatedFlight.execution_status,
    });
  } catch (error) {
    console.error("[gameday/flight/start] Error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

/**
 * Helper function to ensure trip-level gameday_rounds is in_progress
 * Duplicates minimal logic from /api/gameday/start
 */
async function ensureTripGamedayInProgress(
  supabase: any,
  tripId: string,
  userId: string
): Promise<void> {
  try {
    // Check existing gameday_rounds row
    const { data: existing } = await supabase
      .from("gameday_rounds")
      .select("state,published_at,started_at")
      .eq("trip_id", tripId)
      .maybeSingle();

    // If published, skip (don't overwrite published state)
    if (existing && (existing.published_at !== null || existing.state === 'published')) {
      return;
    }

    const now = new Date().toISOString();

    let upsertData: any = {
      trip_id: tripId,
      updated_at: now,
    };

    if (!existing) {
      // Insert new row
      upsertData.state = 'in_progress';
      upsertData.started_at = now;
    } else if (existing.state !== 'in_progress') {
      // Update to in_progress
      upsertData.state = 'in_progress';
      upsertData.started_at = existing.started_at || now;
    } else {
      // Already in_progress - nothing to do
      return;
    }

    // Try upsert (use service client if supabase is already service client)
    const { error: upsertError } = await supabase
      .from("gameday_rounds")
      .upsert(upsertData, { onConflict: "trip_id" });

    if (upsertError && upsertError.code !== "42501") {
      console.error("[gameday/flight/start] Failed to ensure trip gameday in_progress:", upsertError);
      // Don't fail the request - flight start succeeded
    } else if (upsertError && upsertError.code === "42501") {
      // RLS blocked - try with service client
      const { createSupabaseServiceClient } = await import("@/app/lib/supabaseServer");
      const supabaseService = await createSupabaseServiceClient();
      const { error: serviceError } = await supabaseService
        .from("gameday_rounds")
        .upsert(upsertData, { onConflict: "trip_id" });

      if (serviceError) {
        console.error("[gameday/flight/start] Service client failed to ensure trip gameday:", serviceError);
        // Don't fail the request - flight start succeeded
      }
    }
  } catch (error) {
    console.error("[gameday/flight/start] Error ensuring trip gameday:", error);
    // Don't fail the request - flight start succeeded
  }
}
