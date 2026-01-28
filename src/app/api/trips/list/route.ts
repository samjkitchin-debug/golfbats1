import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

export const dynamic = "force-dynamic";

/**
 * GET /api/trips/list
 * Lightweight trips list endpoint with pagination
 * Returns TripListItem[] with minimal fields for list views
 * 
 * Query params:
 * - groupId (required): UUID of the group
 * - limit (optional): Number of trips to return (default 20, max 50)
 * - cursor (optional): Opaque cursor for pagination
 */
export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId");
    const limitParam = searchParams.get("limit");
    const cursor = searchParams.get("cursor");

    if (!groupId) {
      return NextResponse.json(
        { error: "groupId query parameter is required." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Validate and parse limit
    const limit = Math.min(Math.max(parseInt(limitParam || "20", 10) || 20, 1), 50);

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

    // Get current member ID for filtering member trips visibility
    // In canonical schema: members.id == auth.user.id
    let currentMemberId: string | null = null;
    const { data: memberData } = await supabase
      .from("members")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    currentMemberId = memberData?.id || null;

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayYmd = today.toISOString().slice(0, 10);
    
    // Build base query
    let query = supabase
      .from("trips")
      .select(
        "id,legacy_id,name,trip_date,capacity,status,course_id,tee_id,group_id,trip_origin,created_by_member_id,is_posted_to_group,created_at"
      )
      .eq("group_id", groupId)
      .gte("trip_date", todayYmd); // Only trips with date >= today (upcoming only)

    // For member-facing requests, filter member trips by visibility
    if (currentMemberId !== undefined) {
      if (currentMemberId) {
        query = query.or(`trip_origin.eq.group,and(trip_origin.eq.member,or(is_posted_to_group.eq.true,created_by_member_id.eq.${currentMemberId}))`);
      } else {
        query = query.or(`trip_origin.eq.group,and(trip_origin.eq.member,is_posted_to_group.eq.true)`);
      }
    }

    // Parse cursor if provided (format: "trip_date,uuid" or "created_at,uuid")
    if (cursor) {
      try {
        const [dateStr, uuid] = cursor.split(",");
        if (dateStr && uuid) {
          // Use cursor to paginate: trips with trip_date < cursor date OR (trip_date = cursor date AND id < cursor uuid)
          query = query.or(`trip_date.lt.${dateStr},and(trip_date.eq.${dateStr},id.lt.${uuid})`);
        }
      } catch {
        // Invalid cursor format, ignore
      }
    }

    // Order by trip_date DESC, then by id DESC for consistent pagination
    const { data: tripsDataRaw, error: tripsError } = await query
      .order("trip_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1); // Fetch one extra to determine if there's a next page

    if (tripsError) {
      console.error("[trips/list API] Error fetching trips:", tripsError);
      throw new Error(tripsError.message || "Failed to fetch trips.");
    }

    // Filter out truly inactive statuses
    const excludedStatuses = ["completed", "archived"];
    const tripsData = (tripsDataRaw || []).filter(
      (trip) => !excludedStatuses.includes(trip.status)
    );

    // Determine if there's a next page
    const hasMore = tripsData.length > limit;
    const tripsToReturn = hasMore ? tripsData.slice(0, limit) : tripsData;

    if (tripsToReturn.length === 0) {
      return NextResponse.json({ ok: true, trips: [], nextCursor: undefined }, { headers: { "Cache-Control": "no-store" } });
    }

    const tripIds = tripsToReturn.map((t) => t.id);

    // Get creator IDs for member trips
    const creatorIds = Array.from(new Set(
      tripsToReturn
        .filter(t => (t as any).created_by_member_id)
        .map(t => (t as any).created_by_member_id)
    ));

    // Fetch attendee counts and published results status in parallel
    const [attendeesResult, resultsResult, creatorsResult] = await Promise.all([
      supabase
        .from("trip_attendees")
        .select("trip_id,status")
        .in("trip_id", tripIds),
      supabase
        .from("trip_results")
        .select("trip_id,published")
        .in("trip_id", tripIds)
        .eq("published", true),
      // Fetch creator names for member trips
      creatorIds.length > 0
        ? supabase
            .from("members")
            .select("id,display_name,full_name")
            .in("id", creatorIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const { data: attendeesData } = attendeesResult;
    const { data: resultsData } = resultsResult;
    const { data: creatorsData } = creatorsResult;

    // Build creators lookup
    const creatorsById: Record<string, string> = {};
    if (creatorsData) {
      for (const m of creatorsData) {
        creatorsById[m.id] = m.display_name || m.full_name || "Unknown";
      }
    }

    // Build attendee counts and results lookup
    const attendeeCounts: Record<string, number> = {};
    const confirmedCounts: Record<string, number> = {};
    const hasPublishedResults: Record<string, boolean> = {};

    if (attendeesData) {
      for (const a of attendeesData) {
        attendeeCounts[a.trip_id] = (attendeeCounts[a.trip_id] || 0) + 1;
        if (a.status === "confirmed") {
          confirmedCounts[a.trip_id] = (confirmedCounts[a.trip_id] || 0) + 1;
        }
      }
    }

    if (resultsData) {
      for (const r of resultsData) {
        hasPublishedResults[r.trip_id] = true;
      }
    }

    // Generate next cursor from last trip
    const lastTrip = tripsToReturn[tripsToReturn.length - 1];
    const nextCursor = hasMore ? `${lastTrip.trip_date},${lastTrip.id}` : undefined;

    // Map to TripListItem format
    const trips = tripsToReturn.map((trip) => {
      // Generate numeric ID (legacy_id or hash)
      let numericId: number;
      if (trip.legacy_id) {
        numericId = trip.legacy_id;
      } else {
        const uuid = trip.id;
        let hash = 0;
        for (let i = 0; i < uuid.length; i++) {
          const char = uuid.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        numericId = Math.abs(hash) % 1000000 + 1000000;
      }

      const attendeeCount = attendeeCounts[trip.id] || 0;
      const confirmedCount = confirmedCounts[trip.id] || 0;
      const capacity = trip.capacity || 0;
      const openSpots = Math.max(0, capacity - confirmedCount);

      // Compute canonical hosted_by_label
      const tripOrigin = (trip as any).trip_origin || 'group';
      const createdByMemberName = (trip as any).created_by_member_id 
        ? (creatorsById[(trip as any).created_by_member_id] || null)
        : null;
      
      let hostedByLabel: string | undefined;
      if (tripOrigin === 'group') {
        hostedByLabel = `Hosted by ${groupName}`;
      } else if (createdByMemberName) {
        hostedByLabel = `Hosted by ${createdByMemberName}`;
      }

      return {
        id: numericId,
        name: trip.name || undefined,
        date: trip.trip_date,
        courseId: trip.course_id,
        teeId: trip.tee_id,
        capacity,
        status: trip.status as "open" | "closed" | "archived",
        tripOrigin,
        isPostedToGroup: (trip as any).is_posted_to_group !== undefined ? (trip as any).is_posted_to_group : true,
        createdByMemberName,
        hostedByLabel,
        attendeeCount,
        openSpots,
        hasPublishedResults: hasPublishedResults[trip.id] || false,
        groupId: trip.group_id,
      };
    });

    // Log payload size in dev
    if (process.env.NODE_ENV === "development") {
      const payloadSize = JSON.stringify(trips).length;
      console.log(`[trips/list] Payload size: ${payloadSize} bytes for ${trips.length} trips`);
    }

    return NextResponse.json({ ok: true, trips, nextCursor }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Get trips/list error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
