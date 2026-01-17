import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { isTripJoinable } from "@/app/lib/tripDates";
import type { Trip } from "@/app/lib/tripActions";

const CACHE_TAG = "trips";

// Map a single trip row + related rows into the Trip JSON shape used by /api/trips
async function buildTripPayload(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, tripIdentifier: string | number) {
  // Determine if identifier is legacy_id (number) or id (UUID)
  let tripQuery = supabase.from("trips").select("id,group_id,legacy_id,trip_date,status,coordination_status,cutoff_at,signups_opened_at,course_id,tee_id,name,format,capacity,ferry,meeting_point,meet_time,ferry_details,notes,created_at,updated_at,scenario_key");
  
  if (typeof tripIdentifier === "number") {
    tripQuery = tripQuery.eq("legacy_id", tripIdentifier);
  } else {
    tripQuery = tripQuery.eq("id", tripIdentifier);
  }
  
  const { data: trip, error: tripError } = await tripQuery.single();

  if (tripError || !trip) {
    console.error("[join API] buildTripPayload: trip not found after join", {
      tripIdentifier,
      error: tripError?.message,
    });
    return null;
  }

  // Load attendees for this trip
  const { data: attendeesData, error: attendeesError } = await supabase
    .from("trip_attendees")
    .select("trip_id,member_id,status,joined_at,handicap_snapshot,members(id,display_name,full_name)")
    .eq("trip_id", trip.id);

  if (attendeesError) {
    console.warn("[join API] buildTripPayload: failed to load attendees", attendeesError);
  }

  // Load results for this trip
  const { data: resultsData, error: resultsError } = await supabase
    .from("trip_results")
    .select("id,trip_id,published,published_at,notes,result_rows(id,position,display_name,metric_label,metric_value)")
    .eq("trip_id", trip.id);

  if (resultsError) {
    console.warn("[join API] buildTripPayload: failed to load results", resultsError);
  }

  const attendees = (attendeesData || []).map((a: any) => {
    const member = a.members as any;
    const name = member?.display_name || member?.full_name || "Unknown";
    return {
      name,
      status: a.status as "confirmed" | "waitlist" | "out",
      joinedAt: new Date(a.joined_at).getTime(),
      handicapForTrip: a.handicap_snapshot ?? null,
      memberId: a.member_id,
    };
  });

  const result = (resultsData || [])[0];
  const resultRows = result?.result_rows || [];
  const leaderboard = resultRows
    .filter((r: any) => r.metric_label === "points")
    .sort((a: any, b: any) => b.position - a.position)
    .map((r: any) => ({
      name: r.display_name,
      points: Number(r.metric_value) || 0,
    }));

  // Generate numeric ID consistent with /api/trips
  let numericId: number;
  if (trip.legacy_id) {
    numericId = trip.legacy_id;
  } else {
    const uuid = trip.id as string;
    let hash = 0;
    for (let i = 0; i < uuid.length; i++) {
      const char = uuid.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    numericId = Math.abs(hash) % 1000000 + 1000000;
  }

  const payload = {
    id: numericId,
    name: trip.name || undefined,
    date: trip.trip_date,
    format: trip.format,
    course: undefined,
    ferry: trip.ferry || undefined,
    capacity: trip.capacity,
    status: trip.status as "open" | "closed" | "archived",
    coordinationStatus: (trip as any).coordination_status as "draft" | "forming" | "scheduled" | "completed" || "forming",
    cutoffAt: trip.cutoff_at ? new Date(trip.cutoff_at).toISOString() : undefined,
    signupsOpenedAt: trip.signups_opened_at ? new Date(trip.signups_opened_at).toISOString() : undefined,
    courseId: trip.course_id,
    teeId: trip.tee_id,
    scenarioKey: (trip as any).scenario_key || null,
    logistics: {
      meetingPoint: trip.meeting_point || undefined,
      meetTime: trip.meet_time || undefined,
      ferryDetails: trip.ferry_details || undefined,
      notes: trip.notes || undefined,
    },
    attendees,
    result: result && result.published
      ? {
          leaderboard,
          notes: result.notes || undefined,
          publishedAt: result.published_at || undefined,
        }
      : undefined,
    createdAtUtc: trip.created_at,
    updatedAtUtc: trip.updated_at,
  };

  console.log("[join API] buildTripPayload attendees count:", attendees.length, "for tripIdentifier:", tripIdentifier);

  return payload;
}

/**
 * POST /api/trips/[id]/join
 * Join a trip (or update status to confirmed)
 * Body: { handicap?: number | null }
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const paramId = params.id;
    
    // Determine if param is legacy_id (number) or id (UUID)
    // Try parsing as number first
    const legacyId = Number(paramId);
    const isLegacyId = Number.isFinite(legacyId) && String(legacyId) === paramId.trim();
    
    // Find trip - use legacy_id if param is numeric, otherwise use id (UUID)
    let tripQuery = supabase
      .from("trips")
      .select("id,group_id,legacy_id,trip_date,status,signups_opened_at");
    
    if (isLegacyId) {
      tripQuery = tripQuery.eq("legacy_id", legacyId);
    } else {
      tripQuery = tripQuery.eq("id", paramId);
    }
    
    const { data: trip, error: tripErr } = await tripQuery.single();

    if (tripErr || !trip) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }

    // Build trip payload to check joinability using isTripJoinable helper
    // This uses getEffectiveTripPhase which implements auto-open logic (30 days before)
    const tripIdentifier = isLegacyId ? legacyId : trip.id;
    const tripPayload = await buildTripPayload(supabase, tripIdentifier);
    if (!tripPayload) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }

    // Use isTripJoinable to check if trip can be joined (phase === 'openForSignups')
    // This is the single source of truth for joinability checks
    const tripForJoinability: Trip = {
      id: tripPayload.id,
      name: tripPayload.name,
      date: tripPayload.date,
      format: tripPayload.format,
      course: tripPayload.course,
      ferry: tripPayload.ferry,
      capacity: tripPayload.capacity,
      status: tripPayload.status as "open" | "closed" | "archived",
      coordinationStatus: tripPayload.coordinationStatus,
      cutoffAt: tripPayload.cutoffAt,
      signupsOpenedAt: tripPayload.signupsOpenedAt,
      courseId: tripPayload.courseId,
      teeId: tripPayload.teeId,
      logistics: tripPayload.logistics,
      attendees: tripPayload.attendees,
      result: tripPayload.result,
      createdAtUtc: tripPayload.createdAtUtc,
      updatedAtUtc: tripPayload.updatedAtUtc,
    };

    if (!isTripJoinable(tripForJoinability)) {
      // Trip is not joinable - could be scheduled (too early), closed, or past
      return NextResponse.json(
        { error: "RSVP is not available for this trip. It may be too early, closed, or past." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const handicap = body.handicap !== undefined ? body.handicap : null;

    // Insert attendee row - RLS should allow users to insert their own attendee records
    const { error: insertErr } = await supabase
      .from("trip_attendees")
      .insert({
        trip_id: trip.id,
        group_id: trip.group_id,
        member_id: user.id,
        status: "confirmed",
        joined_at: new Date().toISOString(),
        handicap_snapshot: handicap,
      });

    // Handle duplicate join gracefully
    if (insertErr) {
      // PostgreSQL unique constraint violation error code is "23505"
      if (insertErr.code === "23505" || insertErr.message?.includes("duplicate") || insertErr.message?.includes("unique")) {
        // User is already joined - return success with alreadyJoined flag
        const tripIdentifier = isLegacyId ? legacyId : trip.id;
        const tripPayload = await buildTripPayload(supabase, tripIdentifier);
        
        // Invalidate scoped cache tags
        try {
          (revalidateTag as any)(`trips:group:${trip.group_id}`);
          (revalidateTag as any)(`trip:${trip.id}`);
        } catch {
          // Cache will expire via TTL if revalidation fails
        }
        
        return NextResponse.json({ ok: true, alreadyJoined: true, trip: tripPayload });
      }
      
      console.error("[join API] insert error:", insertErr);
      return NextResponse.json(
        { error: insertErr.message || "Failed to join trip." },
        { status: 400 }
      );
    }

    // Build fresh trip payload (including new attendee) so clients can update state without refetching all trips
    const updatedTripPayload = await buildTripPayload(supabase, tripIdentifier);

    // Invalidate scoped cache tags
    try {
      (revalidateTag as any)(`trips:group:${trip.group_id}`);
      (revalidateTag as any)(`trip:${trip.id}`);
    } catch {
      // Cache will expire via TTL if revalidation fails
    }

    return NextResponse.json({ ok: true, trip: updatedTripPayload });
  } catch (error) {
    console.error("Join trip error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

