import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";
import { isEmailAdmin } from "@/app/lib/auth";
import { requireNonEmptyString, optionalNonEmptyString } from "@/app/lib/validation";

export const dynamic = "force-dynamic";

const CACHE_TAG = "trips";

/**
 * Fetch trips data for a specific group using authenticated session client
 * Returns trips with attendees and results in the same JSON format as before
 */
async function fetchTripsData(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  groupId: string,
  groupName: string
) {
  // Get today's date in local timezone (YYYY-MM-DD format)
  // Use UTC date but compare as date strings (YYYY-MM-DD) to avoid timezone issues
  const today = new Date();
  const todayYmd = today.toISOString().slice(0, 10);
  
  // Build base query
  // Return ALL trips for the group - only select fields present in schema.md
  const { data: tripsDataRaw, error: tripsError } = await supabase
    .from("trips")
    .select(
      "id,legacy_id,name,trip_name,trip_date,format,ferry,capacity,status,coordination_status,cutoff_at,signups_opened_at,course_id,tee_id,meeting_point,meet_time,ferry_details,notes,decision_logistics,logistics,created_at,updated_at,group_id,created_by"
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

  // Use service-role client for member lookups to bypass RLS
  const supabaseService = await createSupabaseServiceClient();

  // Fetch member names for created_by (for displaying host name)
  // Note: created_by is the member id (members.id == auth.uid() per schema.md)
  const memberCreatorIds = Array.from(new Set(
    tripsData
      .filter(t => (t as any).created_by)
      .map(t => (t as any).created_by)
  ));
  
  const memberCreatorsById: Record<string, { display_name: string | null; full_name: string | null }> = {};
  if (memberCreatorIds.length > 0) {
    const { data: creatorsData } = await supabaseService
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
      .select("trip_id,published,published_at")
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
  const membersById: Record<string, { 
    display_name: string | null; 
    full_name: string | null;
  }> = {};
  
  if (memberIds.length > 0) {
    // Fetch members (display names only - no compliance data)
    const { data: membersData, error: membersError } = await supabaseService
      .from("members")
      .select("id,display_name,full_name")
      .in("id", memberIds);

    // Dev-only instrumentation for roster resolution correctness
    if (process.env.NODE_ENV !== "production") {
      const totalRequested = memberIds.length;
      const totalReturned = membersData?.length || 0;
      const returnedIds = new Set(membersData?.map(m => m.id) || []);
      const missingIds = memberIds.filter(id => !returnedIds.has(id));
      const missingCount = missingIds.length;
      const first10Missing = missingIds.slice(0, 10);
      
      console.log("[trips API] roster_resolution:", {
        totalRequested,
        totalReturned,
        missingCount,
        first10Missing: first10Missing.length > 0 ? first10Missing : undefined,
        membersError: membersError ? membersError.message : undefined,
      });
    }

    if (membersError) {
      console.error("[trips API] Failed to fetch members for attendees:", membersError);
    } else if (membersData) {
      for (const m of membersData) {
        membersById[m.id] = { 
          display_name: m.display_name, 
          full_name: m.full_name,
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
          // Include member profile fields for display
          fullName: member.full_name || null,
          displayName: member.display_name || null,
        };
      });

    // Find result for this trip (lightweight - only check if published)
    const result = (resultsData || []).find((r: any) => r.trip_id === trip.id);
    const hasResult = result && result.published;
    const resultPublishedAt = hasResult ? (result.published_at || undefined) : undefined;

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

    // Parse decision_logistics JSON column (authoritative)
    let decisionLogistics: any = undefined;
    if ((trip as any).decision_logistics) {
      try {
        decisionLogistics = typeof (trip as any).decision_logistics === 'string'
          ? JSON.parse((trip as any).decision_logistics)
          : (trip as any).decision_logistics;
      } catch (e) {
        console.warn("[trips API] Failed to parse decision_logistics:", e);
      }
    }
    // Fallback to legacy flat columns only if JSON is missing
    if (!decisionLogistics && trip.meeting_point && !trip.ferry_details) {
      decisionLogistics = {
        meetingPoint: trip.meeting_point || undefined,
        meetTime: trip.meet_time || undefined,
      };
    }

    // Parse logistics JSON column (authoritative)
    let logistics: any = undefined;
    if ((trip as any).logistics) {
      try {
        logistics = typeof (trip as any).logistics === 'string'
          ? JSON.parse((trip as any).logistics)
          : (trip as any).logistics;
      } catch (e) {
        console.warn("[trips API] Failed to parse logistics:", e);
      }
    }
    // Fallback to legacy flat columns only if JSON is missing
    if (!logistics) {
      logistics = {
        meetingPoint: trip.meeting_point || undefined,
        meetTime: trip.meet_time || undefined,
        ferryDetails: trip.ferry_details || undefined,
        notes: trip.notes || undefined,
      };
    } else {
      // Merge missing fields from legacy flat columns (preserve existing keys like capacityConfirmed)
      logistics = {
        ...logistics,
        meetingPoint: logistics.meetingPoint ?? trip.meeting_point ?? undefined,
        meetTime: logistics.meetTime ?? trip.meet_time ?? undefined,
        ferryDetails: logistics.ferryDetails ?? trip.ferry_details ?? undefined,
        notes: logistics.notes ?? trip.notes ?? undefined,
      };
    }

    return {
      id: numericId,
      name: trip.name || undefined,
      tripName: (trip as any).trip_name || undefined,
      date: trip.trip_date,
      format: trip.format,
      course: undefined,
      ferry: trip.ferry || undefined,
      capacity: trip.capacity,
      status: trip.status as "open" | "closed" | "archived",
      coordinationStatus: (trip as any).coordination_status as "draft" | "forming" | "scheduled" | "completed",
      cutoffAt: trip.cutoff_at ? new Date(trip.cutoff_at).toISOString() : undefined,
      signupsOpenedAt: (trip as any).signups_opened_at ? new Date((trip as any).signups_opened_at).toISOString() : undefined,
      courseId: trip.course_id,
      teeId: trip.tee_id,
      // scenario_key not in schema - provide null default
      scenarioKey: null,
      // Use parsed JSON columns as authoritative
      decisionLogistics,
      logistics,
      attendees: tripAttendees,
      result: hasResult
        ? {
            publishedAt: resultPublishedAt,
          }
        : undefined,
      createdAtUtc: trip.created_at,
      updatedAtUtc: trip.updated_at,
      // Provide safe defaults for fields not in schema.md
      // All trips have group_id, so default to 'group' origin
      tripOrigin: 'group',
      // created_by is the member id (members.id == auth.uid() per schema.md)
      createdByMemberId: (trip as any).created_by || null,
      // All trips have group_id, so they are all posted to group
      isPostedToGroup: true,
      // Include creator name for member trips (for UI display)
      createdByMemberName: (trip as any).created_by 
        ? (memberCreatorsById[(trip as any).created_by]?.display_name || 
           memberCreatorsById[(trip as any).created_by]?.full_name || 
           null)
        : null,
      // Compute canonical hosted_by_label
      hostedByLabel: (() => {
        // All trips from this endpoint are group trips (have group_id)
        return `Hosted by ${groupName}`;
      })(),
      // Travel fields not in schema - provide undefined defaults
      travelInvolved: undefined,
      travelType: null,
      travelScope: null,
      bookingApproach: null,
      bookingProviderName: null,
      travelNote: null,
      // phase_override not yet in DB - set to null
      phaseOverride: null,
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    // Require groupId query parameter
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId");

    if (!groupId) {
      return NextResponse.json(
        { error: "groupId query parameter is required." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Verify group exists and is active, and fetch group name for hosted_by_label
    const { data: group } = await supabase
      .from("groups")
      .select("id, name")
      .eq("id", groupId)
      .eq("is_active", true)
      .single();

    if (!group) {
      return NextResponse.json(
        { error: "Group not found or inactive." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const groupName = group.name;
    const result = await fetchTripsData(supabase, groupId, groupName);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Get trips error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
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
      return NextResponse.json({ error: "Trip data is required." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    if (!groupId || typeof groupId !== "string") {
      return NextResponse.json(
        { error: "groupId is required and must be a string." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
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
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (tripOrigin === 'member' && !isApprovedMember) {
      return NextResponse.json(
        { error: "You must be an approved member of this group to create member trips." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    const now = new Date().toISOString();

    if (id) {
      // Update existing trip - find by legacy_id and verify it belongs to this group
      const { data: existingTrip } = await supabase
        .from("trips")
        .select("id, group_id, created_by, trip_date, signups_opened_at")
        .eq("legacy_id", id)
        .single();

      if (!existingTrip) {
        return NextResponse.json({ error: "Trip not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
      }

      // Ensure trip belongs to the specified group
      if (existingTrip.group_id !== groupId) {
        return NextResponse.json(
          { error: "Trip does not belong to the specified group." },
          { status: 403, headers: { "Cache-Control": "no-store" } }
        );
      }

      // Determine if this is a group trip (has group_id) or hosted round (group_id is null)
      const isGroupTrip = existingTrip.group_id !== null;
      const existingTripOrigin = isGroupTrip ? 'group' : 'member';

      // For group trips: validate user is admin of the trip's group (not creator-based)
      if (isGroupTrip) {
        // Re-check admin status using trip's actual group_id (not request groupId)
        const { data: tripGroupMember } = await supabase
          .from("group_members")
          .select("role, status")
          .eq("group_id", existingTrip.group_id)
          .eq("user_id", user.id)
          .maybeSingle();

        const isTripGroupAdmin =
          isPlatformAdmin ||
          (tripGroupMember && tripGroupMember.role === "admin" && tripGroupMember.status === "approved");

        if (!isTripGroupAdmin) {
          return NextResponse.json(
            { error: "You must be an approved admin of this group to edit group trips." },
            { status: 403, headers: { "Cache-Control": "no-store" } }
          );
        }
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
            { status: 400, headers: { "Cache-Control": "no-store" } }
          );
        }
      }
      // If trip.name is undefined, do NOT include it in updateData (preserve existing value)

      // Handle trip_name field (trip.tripName or trip.trip_name)
      const tripNameValue = trip.tripName !== undefined ? trip.tripName : (trip as any).trip_name;
      if (tripNameValue !== undefined) {
        if (existingTripOrigin === 'group') {
          // Group trips: allow null or non-empty string (trimmed)
          const trimmed = typeof tripNameValue === 'string' ? tripNameValue.trim() : '';
          updateData.trip_name = trimmed || null;
        } else {
          // Hosted rounds: require non-empty (optional validation)
          try {
            const validatedName = optionalNonEmptyString(tripNameValue);
            if (validatedName !== undefined) {
              updateData.trip_name = validatedName;
            }
          } catch (err) {
            return NextResponse.json(
              { error: err instanceof Error ? err.message : "Trip name cannot be null or empty for hosted rounds" },
              { status: 400, headers: { "Cache-Control": "no-store" } }
            );
          }
        }
      }

      // Handle trip_date (if provided, update it)
      if (trip.date !== undefined) {
        if (typeof trip.date !== "string" || !trip.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return NextResponse.json(
            { error: "Trip date must be in YYYY-MM-DD format" },
            { status: 400, headers: { "Cache-Control": "no-store" } }
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
      // Handle signups gates (group trips only, one-way enforcement)
      if ((trip as any).signupsOpenedAt !== undefined || (trip as any).signups_opened_at !== undefined) {
        if (!isGroupTrip) {
          return NextResponse.json(
            { error: "signupsOpenedAt is not allowed for hosted rounds" },
            { status: 400, headers: { "Cache-Control": "no-store" } }
          );
        }
        
        const signupsOpenedAtValue = (trip as any).signupsOpenedAt !== undefined ? (trip as any).signupsOpenedAt : (trip as any).signups_opened_at;
        
        // One-way rule: reject if null (cannot clear)
        if (signupsOpenedAtValue === null || signupsOpenedAtValue === undefined) {
          return NextResponse.json(
            { error: "Cannot clear signups_opened_at. It can only be set once." },
            { status: 400, headers: { "Cache-Control": "no-store" } }
          );
        }
        
        // One-way rule: reject if already set
        if (existingTrip.signups_opened_at) {
          return NextResponse.json(
            { error: "signups_opened_at can only be set once. It cannot be changed." },
            { status: 400, headers: { "Cache-Control": "no-store" } }
          );
        }
        
        // Validate ISO format (basic check)
        const parsed = new Date(signupsOpenedAtValue);
        if (isNaN(parsed.getTime())) {
          return NextResponse.json(
            { error: "signupsOpenedAt must be a valid ISO timestamp" },
            { status: 400, headers: { "Cache-Control": "no-store" } }
          );
        }
        
        // Scheduled-only rule: check if trip is still in scheduled phase
        const { computeSignupOpenAt } = await import('@/app/lib/tripDates');
        const derivedOpenAt = computeSignupOpenAt(existingTrip.trip_date);
        const derivedOpenTime = new Date(derivedOpenAt).getTime();
        const nowTime = new Date().getTime();
        
        if (nowTime >= derivedOpenTime) {
          return NextResponse.json(
            { error: "Cannot set signups_opened_at. Trip is no longer in scheduled phase." },
            { status: 400, headers: { "Cache-Control": "no-store" } }
          );
        }
        
        // Store server time (ignore client-provided timestamp)
        updateData.signups_opened_at = new Date().toISOString();
      }
      
      if (trip.cutoffAt !== undefined) {
        if (!isGroupTrip) {
          // For hosted rounds, we allow cutoffAt but it's not used for phase derivation
          // Still validate ISO parsing
          if (trip.cutoffAt !== null && trip.cutoffAt !== undefined) {
            const parsed = new Date(trip.cutoffAt);
            if (isNaN(parsed.getTime())) {
              return NextResponse.json(
                { error: "cutoffAt must be a valid ISO timestamp" },
                { status: 400, headers: { "Cache-Control": "no-store" } }
              );
            }
            updateData.cutoff_at = parsed.toISOString();
          } else {
            updateData.cutoff_at = null;
          }
        } else {
          // For group trips, validate ISO parsing
          if (trip.cutoffAt !== null && trip.cutoffAt !== undefined) {
            const parsed = new Date(trip.cutoffAt);
            if (isNaN(parsed.getTime())) {
              return NextResponse.json(
                { error: "cutoffAt must be a valid ISO timestamp" },
                { status: 400, headers: { "Cache-Control": "no-store" } }
              );
            }
            updateData.cutoff_at = parsed.toISOString();
          } else {
            updateData.cutoff_at = null;
          }
        }
      }
      if (trip.courseId !== undefined) {
        updateData.course_id = trip.courseId || null;
      }
      if (trip.teeId !== undefined) {
        updateData.tee_id = trip.teeId || null;
      }
      // scenario_key not in schema.md - ignore if provided
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

      // Handle travel fields (group trips only - ignore for hosted rounds)
      if (existingTripOrigin === 'group') {
        // Only apply travel field updates for group trips
        if (trip.travelInvolved !== undefined) {
          updateData.travel_involved = Boolean(trip.travelInvolved);
        }
        if (trip.travelType !== undefined) {
          updateData.travel_type = trip.travelType || null;
        }
        if (trip.travelScope !== undefined) {
          updateData.travel_scope = trip.travelScope || null;
        }
        if (trip.bookingApproach !== undefined) {
          updateData.booking_approach = trip.bookingApproach || null;
        }
        if (trip.bookingProviderName !== undefined) {
          updateData.booking_provider_name = trip.bookingProviderName || null;
        }
        if (trip.travelNote !== undefined) {
          updateData.travel_note = trip.travelNote || null;
        }
      }
      // For hosted rounds (existingTripOrigin === 'member'): ignore travel field inputs (do not write them)

      // Handle phase_override (group trips only)
      if (existingTripOrigin === 'group') {
        if (trip.phaseOverride !== undefined || (trip as any).phase_override !== undefined) {
          const phaseOverrideValue = trip.phaseOverride !== undefined ? trip.phaseOverride : (trip as any).phase_override;
          // Validate allowed values
          const allowedValues = ['scheduled', 'signups_open', 'locked'];
          if (phaseOverrideValue === null || phaseOverrideValue === '') {
            updateData.phase_override = null;
          } else if (typeof phaseOverrideValue === 'string' && allowedValues.includes(phaseOverrideValue)) {
            updateData.phase_override = phaseOverrideValue;
          } else {
            return NextResponse.json(
              { error: `phaseOverride must be one of: ${allowedValues.join(', ')}, or null` },
              { status: 400, headers: { "Cache-Control": "no-store" } }
            );
          }
        }
      }
      // For hosted rounds: ignore phase_override (do not write it)

      const { error: updateError } = await supabase
        .from("trips")
        .update(updateData)
        .eq("id", existingTrip.id);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message || "Failed to update trip." },
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
      }

      // Invalidate trips cache
      try {
        // @ts-expect-error - revalidateTag signature may vary by Next.js version
        revalidateTag(CACHE_TAG);
      } catch {
        // Cache will expire via TTL if revalidation fails
      }

      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
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
          { status: 500, headers: { "Cache-Control": "no-store" } }
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
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
      }

      // Validate trip_date format (YYYY-MM-DD)
      if (!trip.date || typeof trip.date !== "string") {
        return NextResponse.json(
          { error: "Trip date is required" },
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
      }

      const dateMatch = trip.date.match(/^\d{4}-\d{2}-\d{2}$/);
      if (!dateMatch) {
        return NextResponse.json(
          { error: "Trip date must be in YYYY-MM-DD format" },
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
      }

      validatedDate = trip.date;

      // Determine trip origin and member creator
      // trip.tripOrigin must be explicitly provided - admin flow = 'group', member flow = 'member'
      const tripOrigin = trip.tripOrigin === 'member' ? 'member' : 'group';
      
      // For both group and member trips, get member ID from user
      // Get member ID - in canonical schema: members.id == auth.user.id
      const { data: memberData } = await supabase
        .from("members")
        .select("id,email,display_name,status")
        .eq("id", user.id)
        .maybeSingle();
      
      if (!memberData) {
        return NextResponse.json(
          { error: "Member record not found. Please complete onboarding first." },
          { status: 409, headers: { "Cache-Control": "no-store" } }
        );
      }
      const createdByMemberId = memberData.id;
      
      // Determine is_posted_to_group
      // Group trips: always true
      // Member trips: always true (hosted rounds in a group are visible to the entire group immediately)
      const isPostedToGroup = true;

      // For group trips: do NOT auto-derive trip_name (allow Base Camp to show "Add a trip name")
      // For hosted rounds: derive default trip_name if not provided
      let tripName: string | null = null;
      if (tripOrigin === 'group') {
        // Group trips: only use trip_name if explicitly provided (otherwise null, Base Camp handles it)
        tripName = trip.tripName || null;
      } else {
        // Hosted rounds: derive default trip_name if not provided
        if (!trip.tripName && trip.courseId) {
          // Fetch course name
          const { data: courseData } = await supabase
            .from("courses")
            .select("name")
            .eq("id", trip.courseId)
            .maybeSingle();
          
          const courseName = courseData?.name || null;
          if (courseName) {
            // Format date as "{Dow} {D Mon}"
            const dateObj = new Date(validatedDate + "T00:00:00");
            const dow = dateObj.toLocaleDateString("en-GB", { weekday: "short" });
            const day = dateObj.getDate();
            const mon = dateObj.toLocaleDateString("en-GB", { month: "short" });
            tripName = `${courseName} · ${dow} ${day} ${mon}`;
          }
        } else if (trip.tripName) {
          // Use provided trip_name if user provided one
          tripName = trip.tripName;
        }
      }

      // Build INSERT payload with validated fields
      const tripId = crypto.randomUUID();
      const insertData: any = {
        id: tripId,
        club_id: clubData.id, // Legacy field required by schema
        group_id: groupId, // Canonical scope for trips
        legacy_id: nextLegacyId,
        // Required fields (validated)
        name: validatedName,
        trip_name: tripName, // Auto-generated default name
        trip_date: validatedDate,
        // Other fields with defaults
        format: trip.format || "Stroke", // Use DB default when not explicitly set
        ferry: trip.ferry || null,
        capacity: trip.capacity || 16,
        status: trip.status || "open",
        cutoff_at: trip.cutoffAt ? new Date(trip.cutoffAt).toISOString() : null,
        course_id: trip.courseId || null,
        tee_id: trip.teeId || null,
        // Only include fields present in schema.md
        meeting_point: trip.logistics?.meetingPoint || null,
        meet_time: trip.logistics?.meetTime || null,
        ferry_details: trip.logistics?.ferryDetails || null,
        notes: trip.logistics?.notes || null,
        created_by: createdByMemberId, // created_by is in schema.md (members.id == auth.uid())
        created_at: now,
        updated_at: now,
      };

      const { error: insertError } = await supabase.from("trips").insert(insertData);

      if (insertError) {
        console.error("Trip insert error:", insertError);
        return NextResponse.json(
          { error: insertError.message || "Failed to create trip." },
          { status: 400, headers: { "Cache-Control": "no-store" } }
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
            { status: 400, headers: { "Cache-Control": "no-store" } }
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

      return NextResponse.json({ ok: true, id: nextLegacyId }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (error) {
    console.error("Post trips error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
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
      return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const body = await req.json();
    const { id, groupId } = body as { id?: number; groupId?: string };

    if (!id) {
      return NextResponse.json({ error: "Trip ID is required." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    if (!groupId || typeof groupId !== "string") {
      return NextResponse.json(
        { error: "groupId is required and must be a string." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
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
        { status: 404, headers: { "Cache-Control": "no-store" } }
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
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Find trip by legacy_id and verify it belongs to this group
    const { data: trip } = await supabase
      .from("trips")
      .select("id, group_id")
      .eq("legacy_id", id)
      .single();

    if (!trip) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    // Ensure trip belongs to the specified group
    if (trip.group_id !== groupId) {
      return NextResponse.json(
        { error: "Trip does not belong to the specified group." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
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
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

      // Invalidate scoped cache tags
      try {
        (revalidateTag as any)(`trips:group:${groupId}`);
        (revalidateTag as any)(`trip:${trip.id}`);
      } catch {
        // Cache will expire via TTL if revalidation fails
      }

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Delete trips error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
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
