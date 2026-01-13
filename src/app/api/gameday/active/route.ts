import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * GET /api/gameday/active
 * Returns the most recently active GameDay round for the current user
 * 
 * Response:
 * {
 *   active: null | {
 *     tripId: string,
 *     groupId: string,
 *     state: string,
 *     label: string,
 *     updatedAt: string
 *   }
 * }
 */
export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current member ID - in canonical schema: members.id == auth.user.id
    const { data: memberData } = await supabase
      .from("members")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!memberData) {
      return NextResponse.json({ active: null });
    }

    const memberId = memberData.id;

    // Find trips the member is attending
    const { data: attendeesData } = await supabase
      .from("trip_attendees")
      .select("trip_id")
      .eq("member_id", memberId);

    // Find trips the member created
    const { data: createdTripsData } = await supabase
      .from("trips")
      .select("id")
      .eq("trip_origin", "member")
      .eq("created_by_member_id", memberId);

    // Combine trip IDs
    const attendeeTripIds = (attendeesData || []).map((a: any) => a.trip_id);
    const createdTripIds = (createdTripsData || []).map((t: any) => t.id);
    const allTripIds = [...new Set([...attendeeTripIds, ...createdTripIds])];

    if (allTripIds.length === 0) {
      return NextResponse.json({ active: null });
    }

    // Find active gameday_rounds for these trips
    const { data: gamedayData, error: gamedayError } = await supabase
      .from("gameday_rounds")
      .select("trip_id,state,updated_at")
      .in("trip_id", allTripIds)
      .in("state", ["in_progress", "closed"])
      .is("published_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (gamedayError || !gamedayData) {
      return NextResponse.json({ active: null });
    }

    // Fetch trip details
    const { data: trip, error: tripError } = await supabase
      .from("trips")
      .select("id,group_id,name,trip_date,legacy_id")
      .eq("id", gamedayData.trip_id)
      .eq("trip_origin", "member")
      .single();

    if (tripError || !trip) {
      return NextResponse.json({ active: null });
    }

    // Generate label (use trip name or "Round #" format)
    const tripName = trip.name;
    const tripDate = trip.trip_date;
    const label = tripName || `Round on ${new Date(tripDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

    // Get legacy_id or generate numeric ID for routing
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
      numericId = Math.abs(hash) % 1000000 + 1000000;
    }

    return NextResponse.json({
      active: {
        tripId: String(numericId),
        groupId: (trip as any).group_id,
        state: gamedayData.state,
        label,
        updatedAt: gamedayData.updated_at,
      },
    });
  } catch (error) {
    console.error("Get active gameday error:", error);
    return NextResponse.json({ active: null });
  }
}
