import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";
import { requireAuthedUser, requireApprovedGroupMembership } from "@/app/lib/serverAuth";

/**
 * POST /api/gameday/start
 * Starts a GameDay round (creates/updates gameday_rounds)
 * Any participant (group member) can start the round.
 * 
 * Body:
 * {
 *   tripId: string  // UUID
 * }
 * 
 * Response:
 * {
 *   ok: true,
 *   tripId: string,
 *   state: 'in_progress'
 * }
 * 
 * Errors:
 * - 401: Unauthorized
 * - 403: User is not a member of the trip's group
 * - 404: Trip not found
 * - 409: Round already published (reason: 'already_published')
 * - 500: Server error
 */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Require authenticated user
    let userId: string;
    try {
      const authResult = await requireAuthedUser();
      userId = authResult.userId;
    } catch (error) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { tripId } = body as { tripId?: string };

    if (!tripId || typeof tripId !== "string") {
      return NextResponse.json(
        { ok: false, error: "tripId is required" },
        { status: 400 }
      );
    }

    // Verify the user can access this trip:
    // The user must be a member of the trip's group
    const { data: tripData, error: tripError } = await supabase
      .from("trips")
      .select("id,group_id")
      .eq("id", tripId)
      .single();

    if (tripError || !tripData) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 }
      );
    }

    // Check group membership using shared helper
    try {
      await requireApprovedGroupMembership({
        supabase,
        userId,
        groupId: tripData.group_id,
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }

    // Check existing gameday_rounds row
    const { data: existing } = await supabase
      .from("gameday_rounds")
      .select("state,published_at,started_at")
      .eq("trip_id", tripId)
      .maybeSingle();

    // If published, return 409
    if (existing && (existing.published_at !== null || existing.state === 'published')) {
      return NextResponse.json(
        { ok: false, reason: "already_published" },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();

    // Upsert logic:
    // - If none exists: INSERT with state='in_progress', started_at=now()
    // - Else if state != 'in_progress': UPDATE set state='in_progress', started_at=coalesce(started_at, now())
    // - Else already in_progress: do nothing (idempotent)

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
      // Already in_progress - idempotent, return success without update
      return NextResponse.json({
        ok: true,
        tripId,
        state: 'in_progress',
      });
    }

    // Try with regular client first
    const { data: gamedayData, error: upsertError } = await supabase
      .from("gameday_rounds")
      .upsert(upsertData, { onConflict: "trip_id" })
      .select("trip_id,state")
      .single();

    // If RLS blocks, use service client
    if (upsertError && upsertError.code === "42501") {
      const supabaseService = await createSupabaseServiceClient();
      const { data: serviceData, error: serviceError } = await supabaseService
        .from("gameday_rounds")
        .upsert(upsertData, { onConflict: "trip_id" })
        .select("trip_id,state")
        .single();

      if (serviceError || !serviceData) {
        console.error("[gameday/start] Service client upsert error:", serviceError);
        return NextResponse.json(
          { ok: false, error: serviceError?.message || "Failed to start round" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        tripId: serviceData.trip_id,
        state: serviceData.state,
      });
    }

    if (upsertError || !gamedayData) {
      console.error("[gameday/start] Upsert error:", upsertError);
      return NextResponse.json(
        { ok: false, error: upsertError?.message || "Failed to start round" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      tripId: gamedayData.trip_id,
      state: gamedayData.state,
    });
  } catch (error) {
    console.error("[gameday/start] Error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
