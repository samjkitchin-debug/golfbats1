import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { isEmailAdmin } from "@/app/lib/auth";

const CACHE_TAG = "trips";

/**
 * Fetch trips data for a specific group using authenticated session client
 * Returns trips with attendees and results in the same JSON format as before
 */
async function fetchTripsData(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  groupId: string
) {
  // Get today's date in local timezone (YYYY-MM-DD format)
  // Use UTC date but compare as date strings (YYYY-MM-DD) to avoid timezone issues
  const today = new Date();
  const todayYmd = today.toISOString().slice(0, 10);
  
  // Fetch trips for the specified group - only upcoming trips (trip_date >= today)
  // Exclude past-status trips: completed, archived, closed (those belong in Results)
  // Only select columns we actually use (performance optimization)
  const { data: tripsDataRaw, error: tripsError } = await supabase
    .from("trips")
    .select(
      "id,legacy_id,name,trip_date,format,ferry,capacity,status,cutoff_at,course_id,tee_id,meeting_point,meet_time,ferry_details,notes,created_at,updated_at,group_id"
    )
    .eq("group_id", groupId)
    .gte("trip_date", todayYmd) // Only trips with date >= today (upcoming only)
    .order("trip_date", { ascending: false });

  if (tripsError) {
    console.error("[trips API] Error fetching trips:", tripsError);
    throw new Error(tripsError.message || "Failed to fetch trips.");
  }

  // Filter out past-status trips in JavaScript (completed, archived, closed belong in Results)
  const excludedStatuses = ["completed", "archived", "closed"];
  const tripsData = (tripsDataRaw || []).filter(
    (trip) => !excludedStatuses.includes(trip.status)
  );

  if (!tripsData || tripsData.length === 0) {
    return { ok: true, trips: [] };
  }

  const tripIds = tripsData.map((t) => t.id);

  // Fetch attendees for all trips in parallel with results
  const [attendeesResult, resultsResult] = await Promise.all([
    supabase
      .from("trip_attendees")
      .select("trip_id,member_id,status,joined_at,handicap_snapshot")
      .in("trip_id", tripIds),
    supabase
      .from("trip_results")
      .select("id,trip_id,published,published_at,notes,result_rows(id,position,display_name,metric_label,metric_value)")
      .in("trip_id", tripIds),
  ]);

  const { data: attendeesData, error: attendeesError } = attendeesResult;
  const { data: resultsData, error: resultsError } = resultsResult;

  if (attendeesError) {
    console.warn("[trips API] Failed to fetch attendees:", attendeesError);
  }
  if (resultsError) {
    console.warn("[trips API] Failed to fetch results:", resultsError);
  }

  const attendees = attendeesData || [];
  const memberIds = Array.from(new Set(attendees.map((a: any) => a.member_id).filter(Boolean)));

  // Fetch member display names only if we have attendees
  const membersById: Record<string, { display_name: string | null; full_name: string | null }> = {};
  if (memberIds.length > 0) {
    const { data: membersData, error: membersError } = await supabase
      .from("members")
      .select("id,display_name,full_name")
      .in("id", memberIds);

    if (membersError) {
      console.warn("[trips API] Failed to fetch members for attendees:", membersError);
    } else if (membersData) {
      for (const m of membersData) {
        membersById[m.id] = { display_name: m.display_name, full_name: m.full_name };
      }
    }
  }

  // Map database trips to UI Trip format
  const trips = tripsData.map((trip) => {
    // Filter attendees for this trip (more efficient than nested loops)
    const tripAttendees = attendees
      .filter((a: any) => a.trip_id === trip.id)
      .map((a: any) => {
        const member = membersById[a.member_id] || {};
        const name = member.display_name || member.full_name || "Unknown";
        return {
          name,
          status: a.status as "confirmed" | "waitlist" | "out",
          joinedAt: new Date(a.joined_at).getTime(),
          handicapForTrip: a.handicap_snapshot ?? null,
          memberId: a.member_id,
        };
      });

    // Find result for this trip
    const result = (resultsData || []).find((r: any) => r.trip_id === trip.id);
    const resultRows = (result?.result_rows || []) as Array<{
      metric_label: string;
      position: number;
      display_name: string;
      metric_value: string;
    }>;
    
    // Build leaderboard only if result exists and is published
    const leaderboard =
      result && result.published
        ? resultRows
            .filter((r) => r.metric_label === "points")
            .sort((a, b) => b.position - a.position)
            .map((r) => ({
              name: r.display_name,
              points: Number(r.metric_value) || 0,
            }))
        : undefined;

    // Generate unique numeric ID: use legacy_id if available, otherwise use a hash of the UUID
    let numericId: number;
    if (trip.legacy_id) {
      numericId = trip.legacy_id;
    } else {
      // Hash UUID to generate consistent numeric ID
      const uuid = trip.id;
      let hash = 0;
      for (let i = 0; i < uuid.length; i++) {
        const char = uuid.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      numericId = Math.abs(hash) % 1000000 + 1000000; // Range: 1000000-1999999
    }

    return {
      id: numericId,
      name: trip.name || undefined,
      date: trip.trip_date,
      format: trip.format,
      course: undefined,
      ferry: trip.ferry || undefined,
      capacity: trip.capacity,
      status: trip.status as "open" | "closed" | "archived",
      cutoffAt: trip.cutoff_at ? new Date(trip.cutoff_at).toISOString() : undefined,
      courseId: trip.course_id,
      teeId: trip.tee_id,
      logistics: {
        meetingPoint: trip.meeting_point || undefined,
        meetTime: trip.meet_time || undefined,
        ferryDetails: trip.ferry_details || undefined,
        notes: trip.notes || undefined,
      },
      attendees: tripAttendees,
      result: result && result.published && leaderboard
        ? {
            leaderboard,
            notes: result.notes || undefined,
            publishedAt: result.published_at || undefined,
          }
        : undefined,
      createdAtUtc: trip.created_at,
      updatedAtUtc: trip.updated_at,
    };
  });

  return { ok: true, trips };
}

/**
 * GET /api/trips
 * Retrieve trips for a specific group with attendees and results
 * Requires authentication and groupId query parameter
 * Query params: ?groupId=<uuid>
 */
export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Require groupId query parameter
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId");

    if (!groupId) {
      return NextResponse.json(
        { error: "groupId query parameter is required." },
        { status: 400 }
      );
    }

    // Verify group exists and is active
    const { data: group } = await supabase
      .from("groups")
      .select("id")
      .eq("id", groupId)
      .eq("is_active", true)
      .single();

    if (!group) {
      return NextResponse.json(
        { error: "Group not found or inactive." },
        { status: 404 }
      );
    }

    const result = await fetchTripsData(supabase, groupId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Get trips error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/trips
 * Create or update a trip (group admin only)
 * Body: { trip: Trip, groupId: string, id?: number } - if id provided, updates; otherwise creates
 */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Check authentication
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const body = await req.json();
    const { trip, groupId, id } = body as { trip: any; groupId?: string; id?: number };

    if (!trip) {
      return NextResponse.json({ error: "Trip data is required." }, { status: 400 });
    }

    if (!groupId || typeof groupId !== "string") {
      return NextResponse.json(
        { error: "groupId is required and must be a string." },
        { status: 400 }
      );
    }

    // Verify group exists and is active
    const { data: group } = await supabase
      .from("groups")
      .select("id")
      .eq("id", groupId)
      .eq("is_active", true)
      .single();

    if (!group) {
      return NextResponse.json(
        { error: "Group not found or inactive." },
        { status: 404 }
      );
    }

    // Check group admin authorization: platform admin OR approved group admin
    const isPlatformAdmin = isEmailAdmin(user.email);

    // Check if user is approved admin of this group
    const { data: groupMember } = await supabase
      .from("group_members")
      .select("role, status")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    const isGroupAdmin =
      isPlatformAdmin ||
      (groupMember && groupMember.role === "admin" && groupMember.status === "approved");

    if (!isGroupAdmin) {
      return NextResponse.json(
        { error: "You must be an approved admin of this group to manage trips." },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();

    if (id) {
      // Update existing trip - find by legacy_id and verify it belongs to this group
      const { data: existingTrip } = await supabase
        .from("trips")
        .select("id, group_id")
        .eq("legacy_id", id)
        .single();

      if (!existingTrip) {
        return NextResponse.json({ error: "Trip not found." }, { status: 404 });
      }

      // Ensure trip belongs to the specified group
      if (existingTrip.group_id !== groupId) {
        return NextResponse.json(
          { error: "Trip does not belong to the specified group." },
          { status: 403 }
        );
      }

      // IMPORTANT: User-entered name and date must never be overridden by defaults or recipe logic.
      const updateData: any = {
        name: trip.name !== undefined && trip.name !== null ? String(trip.name).trim() || null : null,
        trip_date: trip.date,
        format: trip.format,
        ferry: trip.ferry || null,
        capacity: trip.capacity,
        status: trip.status,
        cutoff_at: trip.cutoffAt ? new Date(trip.cutoffAt).toISOString() : null,
        course_id: trip.courseId || null,
        tee_id: trip.teeId || null,
        meeting_point: trip.logistics?.meetingPoint || null,
        meet_time: trip.logistics?.meetTime || null,
        ferry_details: trip.logistics?.ferryDetails || null,
        notes: trip.logistics?.notes || null,
        updated_at: now,
      };

      const { error: updateError } = await supabase
        .from("trips")
        .update(updateData)
        .eq("id", existingTrip.id);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message || "Failed to update trip." },
          { status: 400 }
        );
      }

      // Invalidate trips cache
      try {
        // @ts-expect-error - revalidateTag signature may vary by Next.js version
        revalidateTag(CACHE_TAG);
      } catch {
        // Cache will expire via TTL if revalidation fails
      }

      return NextResponse.json({ ok: true });
    } else {
      // Create new trip
      // Get next legacy_id (globally unique - constraint requires uniqueness across all trips)
      const { data: maxTrip } = await supabase
        .from("trips")
        .select("legacy_id")
        .not("legacy_id", "is", null)
        .order("legacy_id", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextLegacyId = maxTrip?.legacy_id ? Number(maxTrip.legacy_id) + 1 : 1;

      // Get default club_id for schema compliance (club_id is NOT NULL in schema)
      // Note: group_id is the canonical scope for trips; club_id is legacy
      const clubSlug = process.env.NEXT_PUBLIC_CLUB_SLUG || "golfbats";
      const { data: clubData } = await supabase
        .from("clubs")
        .select("id")
        .eq("slug", clubSlug)
        .single();
      
      if (!clubData) {
        return NextResponse.json(
          { error: `Default club not found. Please ensure a club with slug '${clubSlug}' exists in the database.` },
          { status: 500 }
        );
      }

      // IMPORTANT: User-entered name and date must never be overridden by defaults or recipe logic.
      // Build canonical payload - explicitly pass user input, fallback to defaults only if missing.
      const tripId = crypto.randomUUID();
      const insertData: any = {
        id: tripId,
        club_id: clubData.id, // Legacy field required by schema
        group_id: groupId, // Canonical scope for trips
        legacy_id: nextLegacyId,
        // User input fields - explicitly pass even if empty (fallback only if truly missing)
        name: trip.name !== undefined && trip.name !== null ? String(trip.name).trim() || null : null,
        trip_date: trip.date || new Date().toISOString().slice(0, 10),
        // Other fields with defaults
        format: trip.format || "Stableford",
        ferry: trip.ferry || null,
        capacity: trip.capacity || 16,
        status: trip.status || "open",
        cutoff_at: trip.cutoffAt ? new Date(trip.cutoffAt).toISOString() : null,
        course_id: trip.courseId || null,
        tee_id: trip.teeId || null,
        meeting_point: trip.logistics?.meetingPoint || null,
        meet_time: trip.logistics?.meetTime || null,
        ferry_details: trip.logistics?.ferryDetails || null,
        notes: trip.logistics?.notes || null,
        created_at: now,
        updated_at: now,
      };

      const { error: insertError } = await supabase.from("trips").insert(insertData);

      if (insertError) {
        console.error("Trip insert error:", insertError);
        return NextResponse.json(
          { error: insertError.message || "Failed to create trip." },
          { status: 400 }
        );
      }

      // Invalidate trips cache
      try {
        // @ts-expect-error - revalidateTag signature may vary by Next.js version
        revalidateTag(CACHE_TAG);
      } catch {
        // Cache will expire via TTL if revalidation fails
      }

      return NextResponse.json({ ok: true, id: nextLegacyId });
    }
  } catch (error) {
    console.error("Post trips error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/trips
 * Delete a trip (group admin only)
 * Body: { id: number, groupId: string } - legacy_id and groupId
 */
export async function DELETE(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Check authentication
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const body = await req.json();
    const { id, groupId } = body as { id?: number; groupId?: string };

    if (!id) {
      return NextResponse.json({ error: "Trip ID is required." }, { status: 400 });
    }

    if (!groupId || typeof groupId !== "string") {
      return NextResponse.json(
        { error: "groupId is required and must be a string." },
        { status: 400 }
      );
    }

    // Verify group exists and is active
    const { data: group } = await supabase
      .from("groups")
      .select("id")
      .eq("id", groupId)
      .eq("is_active", true)
      .single();

    if (!group) {
      return NextResponse.json(
        { error: "Group not found or inactive." },
        { status: 404 }
      );
    }

    // Check group admin authorization: platform admin OR approved group admin
    const isPlatformAdmin = isEmailAdmin(user.email);

    // Check if user is approved admin of this group
    const { data: groupMember } = await supabase
      .from("group_members")
      .select("role, status")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    const isGroupAdmin =
      isPlatformAdmin ||
      (groupMember && groupMember.role === "admin" && groupMember.status === "approved");

    if (!isGroupAdmin) {
      return NextResponse.json(
        { error: "You must be an approved admin of this group to delete trips." },
        { status: 403 }
      );
    }

    // Find trip by legacy_id and verify it belongs to this group
    const { data: trip } = await supabase
      .from("trips")
      .select("id, group_id")
      .eq("legacy_id", id)
      .single();

    if (!trip) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }

    // Ensure trip belongs to the specified group
    if (trip.group_id !== groupId) {
      return NextResponse.json(
        { error: "Trip does not belong to the specified group." },
        { status: 403 }
      );
    }

    // Delete related data first
    await supabase.from("trip_attendees").delete().eq("trip_id", trip.id);
    await supabase.from("trip_results").delete().eq("trip_id", trip.id);

    // Delete trip
    const { error: deleteError } = await supabase.from("trips").delete().eq("id", trip.id);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message || "Failed to delete trip." },
        { status: 400 }
      );
    }

    // Invalidate trips cache
    try {
      // @ts-expect-error - revalidateTag signature may vary by Next.js version
      revalidateTag(CACHE_TAG);
    } catch {
      // Cache will expire via TTL if revalidation fails
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete trips error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

