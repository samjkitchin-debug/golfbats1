import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { isEmailAdmin } from "@/app/lib/auth";
import { requireNonEmptyString, optionalNonEmptyString } from "@/app/lib/validation";

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
  
  // Build base query
  // Return ALL trips for the group - no filtering by origin, creator, or posted status
  const { data: tripsDataRaw, error: tripsError } = await supabase
    .from("trips")
    .select(
      "id,legacy_id,name,trip_date,format,ferry,capacity,status,coordination_status,cutoff_at,course_id,tee_id,meeting_point,meet_time,ferry_details,notes,created_at,updated_at,group_id,scenario_key,trip_origin,created_by_member_id,is_posted_to_group"
    )
    .eq("group_id", groupId)
    .gte("trip_date", todayYmd) // Only trips with date >= today (upcoming only)
    .order("trip_date", { ascending: false });

  if (tripsError) {
    console.error("[trips API] Error fetching trips:", tripsError);
    throw new Error(tripsError.message || "Failed to fetch trips.");
  }

  // Filter out truly inactive statuses (completed, archived belong in Results)
  // "closed" means signups closed but trip is still upcoming - MUST remain visible
  const excludedStatuses = ["completed", "archived"];
  const tripsData = (tripsDataRaw || []).filter(
    (trip) => !excludedStatuses.includes(trip.status)
  );

  if (!tripsData || tripsData.length === 0) {
    return { ok: true, trips: [] };
  }

  const tripIds = tripsData.map((t) => t.id);

  // Fetch member names for created_by_member_id (for displaying host name)
  const memberCreatorIds = Array.from(new Set(
    tripsData
      .filter(t => (t as any).created_by_member_id)
      .map(t => (t as any).created_by_member_id)
  ));
  
  const memberCreatorsById: Record<string, { display_name: string | null; full_name: string | null }> = {};
  if (memberCreatorIds.length > 0) {
    const { data: creatorsData } = await supabase
      .from("members")
      .select("id, display_name, full_name")
      .in("id", memberCreatorIds);
    
    if (creatorsData) {
      for (const m of creatorsData) {
        memberCreatorsById[m.id] = {
          display_name: m.display_name,
          full_name: m.full_name,
        };
      }
    }
  }

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

  // Fetch member display names and passport data only if we have attendees
  const membersById: Record<string, { 
    display_name: string | null; 
    full_name: string | null;
    passport_full_name: string | null;
    passport_number: string | null;
    passport_nationality: string | null;
    passport_date_of_birth: string | null;
    passport_expiry_date: string | null;
  }> = {};
  if (memberIds.length > 0) {
    // Fetch members with their passport data from member_profiles
    const { data: membersData, error: membersError } = await supabase
      .from("members")
      .select(`
        id,
        display_name,
        full_name,
        member_profiles(
          passport_full_name,
          passport_number,
          passport_nationality,
          passport_date_of_birth,
          passport_expiry_date
        )
      `)
      .in("id", memberIds);

    if (membersError) {
      console.warn("[trips API] Failed to fetch members for attendees:", membersError);
    } else if (membersData) {
      for (const m of membersData) {
        const profile = (m.member_profiles as any)?.[0] || null;
        membersById[m.id] = { 
          display_name: m.display_name, 
          full_name: m.full_name,
          passport_full_name: profile?.passport_full_name ?? null,
          passport_number: profile?.passport_number ?? null,
          passport_nationality: profile?.passport_nationality ?? null,
          passport_date_of_birth: profile?.passport_date_of_birth ?? null,
          passport_expiry_date: profile?.passport_expiry_date ?? null,
        };
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
          // Include passport fields from member_profiles
          passportFullName: member.passport_full_name,
          passportNumber: member.passport_number,
          passportNationality: member.passport_nationality,
          passportDateOfBirth: member.passport_date_of_birth,
          passportExpiryDate: member.passport_expiry_date,
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
      coordinationStatus: (trip as any).coordination_status as "draft" | "forming" | "scheduled" | "completed",
      cutoffAt: trip.cutoff_at ? new Date(trip.cutoff_at).toISOString() : undefined,
      courseId: trip.course_id,
      teeId: trip.tee_id,
      scenarioKey: (trip as any).scenario_key || null,
      // Decision logistics: meeting_point/meet_time when ferry_details is null (decision-grade only)
      // Operational logistics: full logistics object when ferry_details exists
      decisionLogistics: trip.meeting_point && !trip.ferry_details ? {
        meetingPoint: trip.meeting_point || undefined,
        meetTime: trip.meet_time || undefined,
      } : undefined,
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
      tripOrigin: (trip as any).trip_origin || 'group',
      createdByMemberId: (trip as any).created_by_member_id || null,
      isPostedToGroup: (trip as any).is_posted_to_group !== undefined ? (trip as any).is_posted_to_group : true,
      // Include creator name for member trips (for UI display)
      createdByMemberName: (trip as any).created_by_member_id 
        ? (memberCreatorsById[(trip as any).created_by_member_id]?.display_name || 
           memberCreatorsById[(trip as any).created_by_member_id]?.full_name || 
           null)
        : null,
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

    // Determine trip origin from request (if not provided, default to 'group' for backward compatibility)
    const tripOrigin = trip.tripOrigin === 'member' ? 'member' : 'group';
    
    // Authorization: 
    // - Only admins can create group trips
    // - Any approved member can create member trips
    const isPlatformAdmin = isEmailAdmin(user.email);

    // Check group membership
    const { data: groupMember } = await supabase
      .from("group_members")
      .select("role, status")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    const isGroupAdmin =
      isPlatformAdmin ||
      (groupMember && groupMember.role === "admin" && groupMember.status === "approved");

    const isApprovedMember = 
      groupMember && groupMember.status === "approved";

    if (tripOrigin === 'group' && !isGroupAdmin) {
      return NextResponse.json(
        { error: "You must be an approved admin of this group to create group trips." },
        { status: 403 }
      );
    }

    if (tripOrigin === 'member' && !isApprovedMember) {
      return NextResponse.json(
        { error: "You must be an approved member of this group to create member trips." },
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

      // IMPORTANT: PATCH semantics - only update fields that are actually provided (undefined = omit, null = reject for name).
      // Build sparse update payload conditionally.
      const updateData: any = {
        updated_at: now,
      };

      // Handle name field with strict validation
      if (trip.name !== undefined) {
        try {
          const validatedName = optionalNonEmptyString(trip.name);
          if (validatedName !== undefined) {
            updateData.name = validatedName;
          }
        } catch (err) {
          return NextResponse.json(
            { error: err instanceof Error ? err.message : "Trip name cannot be null or empty" },
            { status: 400 }
          );
        }
      }
      // If trip.name is undefined, do NOT include it in updateData (preserve existing value)

      // Handle trip_date (if provided, update it)
      if (trip.date !== undefined) {
        if (typeof trip.date !== "string" || !trip.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return NextResponse.json(
            { error: "Trip date must be in YYYY-MM-DD format" },
            { status: 400 }
          );
        }
        updateData.trip_date = trip.date;
      }

      // Handle other fields (only include if provided)
      if (trip.format !== undefined) {
        updateData.format = trip.format;
      }
      if (trip.ferry !== undefined) {
        updateData.ferry = trip.ferry || null;
      }
      if (trip.capacity !== undefined) {
        updateData.capacity = trip.capacity;
      }
      if (trip.status !== undefined) {
        updateData.status = trip.status;
      }
      if (trip.cutoffAt !== undefined) {
        updateData.cutoff_at = trip.cutoffAt ? new Date(trip.cutoffAt).toISOString() : null;
      }
      if (trip.courseId !== undefined) {
        updateData.course_id = trip.courseId || null;
      }
      if (trip.teeId !== undefined) {
        updateData.tee_id = trip.teeId || null;
      }
      if (trip.scenarioKey !== undefined) {
        // Validate scenario_key if provided
        const allowedScenarioKeys = ['local_round', 'away_day', 'overnight_trip', 'organiser_booking', 'cross_border_agent'];
        if (trip.scenarioKey === null || trip.scenarioKey === '') {
          updateData.scenario_key = null;
        } else if (typeof trip.scenarioKey === 'string' && allowedScenarioKeys.includes(trip.scenarioKey)) {
          updateData.scenario_key = trip.scenarioKey;
        } else {
          return NextResponse.json(
            { error: `scenarioKey must be one of: ${allowedScenarioKeys.join(', ')}, or null` },
            { status: 400 }
          );
        }
      }
      // Handle decision logistics (stored in meeting_point/meet_time when no ferry_details)
      if (trip.decisionLogistics !== undefined) {
        updateData.meeting_point = trip.decisionLogistics?.meetingPoint || null;
        updateData.meet_time = trip.decisionLogistics?.meetTime || null;
        // Decision logistics doesn't include ferry_details, so preserve existing or set to null
        if (trip.logistics === undefined) {
          // If logistics not provided, preserve existing ferry_details/notes
          // Decision logistics only updates meeting_point/meet_time
        }
      }
      // Handle operational logistics (full logistics object, may include ferry_details)
      if (trip.logistics !== undefined) {
        updateData.meeting_point = trip.logistics?.meetingPoint || null;
        updateData.meet_time = trip.logistics?.meetTime || null;
        updateData.ferry_details = trip.logistics?.ferryDetails || null;
        updateData.notes = trip.logistics?.notes || null;
      }

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

      // IMPORTANT: Trip name is REQUIRED (Option B). Users cannot create a trip with null/empty/whitespace name.
      // Validate required fields
      let validatedName: string;
      let validatedDate: string;

      try {
        validatedName = requireNonEmptyString(trip.name, "Trip name");
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Trip name is required" },
          { status: 400 }
        );
      }

      // Validate trip_date format (YYYY-MM-DD)
      if (!trip.date || typeof trip.date !== "string") {
        return NextResponse.json(
          { error: "Trip date is required" },
          { status: 400 }
        );
      }

      const dateMatch = trip.date.match(/^\d{4}-\d{2}-\d{2}$/);
      if (!dateMatch) {
        return NextResponse.json(
          { error: "Trip date must be in YYYY-MM-DD format" },
          { status: 400 }
        );
      }

      validatedDate = trip.date;

      // Validate scenario_key if provided
      const allowedScenarioKeys = ['local_round', 'carpool_round', 'away_day', 'overnight_trip', 'organiser_booking', 'cross_border_agent', 'casual_round'];
      let validatedScenarioKey: string | null = null;
      if (trip.scenarioKey !== undefined) {
        if (trip.scenarioKey === null || trip.scenarioKey === '') {
          validatedScenarioKey = null;
        } else if (typeof trip.scenarioKey === 'string' && allowedScenarioKeys.includes(trip.scenarioKey)) {
          validatedScenarioKey = trip.scenarioKey;
        } else {
          return NextResponse.json(
            { error: `scenarioKey must be one of: ${allowedScenarioKeys.join(', ')}, or null` },
            { status: 400 }
          );
        }
      }

      // Determine trip origin and member creator
      // trip.tripOrigin must be explicitly provided - admin flow = 'group', member flow = 'member'
      const tripOrigin = trip.tripOrigin === 'member' ? 'member' : 'group';
      
      // For member trips, get member ID from user
      let createdByMemberId: string | null = null;
      if (tripOrigin === 'member') {
        // Get member ID - in canonical schema: members.id == auth.user.id
        const { data: memberData } = await supabase
          .from("members")
          .select("id,email,display_name,status")
          .eq("id", user.id)
          .maybeSingle();
        
        if (!memberData) {
          return NextResponse.json(
            { error: "Member record not found. Please complete onboarding first." },
            { status: 409 }
          );
        }
        createdByMemberId = memberData.id;
      }
      
      // Determine is_posted_to_group
      // Group trips: always true
      // Member trips: always true (hosted rounds in a group are visible to the entire group immediately)
      const isPostedToGroup = true;

      // Build INSERT payload with validated fields
      const tripId = crypto.randomUUID();
      const insertData: any = {
        id: tripId,
        club_id: clubData.id, // Legacy field required by schema
        group_id: groupId, // Canonical scope for trips
        legacy_id: nextLegacyId,
        // Required fields (validated)
        name: validatedName,
        trip_date: validatedDate,
        // Other fields with defaults
        format: trip.format || "Stableford",
        ferry: trip.ferry || null,
        capacity: trip.capacity || 16,
        status: trip.status || "open",
        cutoff_at: trip.cutoffAt ? new Date(trip.cutoffAt).toISOString() : null,
        course_id: trip.courseId || null,
        tee_id: trip.teeId || null,
        scenario_key: validatedScenarioKey,
        meeting_point: trip.logistics?.meetingPoint || null,
        meet_time: trip.logistics?.meetTime || null,
        ferry_details: trip.logistics?.ferryDetails || null,
        notes: trip.logistics?.notes || null,
        trip_origin: tripOrigin,
        created_by_member_id: createdByMemberId,
        is_posted_to_group: isPostedToGroup,
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

      // For member trips, automatically create attendee row for the creator
      if (tripOrigin === 'member' && createdByMemberId) {
        // Use upsert for idempotency (onConflict handles case where row already exists)
        const { error: attendeeError } = await supabase
          .from("trip_attendees")
          .upsert(
            {
              trip_id: tripId,
              group_id: groupId,
              member_id: createdByMemberId,
              status: "confirmed",
              joined_at: now,
              handicap_snapshot: null,
            },
            { onConflict: "trip_id,member_id" }
          );

        if (attendeeError) {
          console.error("Failed to create attendee for member trip creator:", attendeeError);
          // This is required for GameDay visibility, so return error
          return NextResponse.json(
            { error: "Trip created but failed to add creator as attendee. Please try again." },
            { status: 400 }
          );
        }
      }

      // Invalidate scoped cache tags
      try {
        (revalidateTag as any)(`trips:group:${groupId}`);
        (revalidateTag as any)(`trip:${tripId}`);
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

      // Invalidate scoped cache tags
      try {
        (revalidateTag as any)(`trips:group:${groupId}`);
        (revalidateTag as any)(`trip:${trip.id}`);
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


/**
 * API Contract: Trip Name Validation (Option B)
 * 
 * POST (create):
 * - name missing/undefined -> 400: "Trip name is required"
 * - name null -> 400: "Trip name is required"
 * - name "   " (whitespace) -> 400: "Trip name cannot be empty"
 * - name "Valid Name" -> 201: success
 * 
 * PATCH/PUT (update via POST with id):
 * - name undefined -> does not change (field omitted from update)
 * - name null -> 400: "Field cannot be null"
 * - name "   " (whitespace) -> 400: "Field cannot be empty"
 * - name "New Name" -> 200: updates name
 * 
 * Semantics:
 * - undefined = field not provided (omit from update, do not change)
 * - null = explicit null (rejected for name)
 * - empty/whitespace = rejected for name
 */
