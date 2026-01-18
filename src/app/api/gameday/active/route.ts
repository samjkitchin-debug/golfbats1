import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { todayInSGT } from "@/app/lib/tripDates";

export const dynamic = "force-dynamic";

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
      return NextResponse.json({ error: "Unauthorized" }, { 
        status: 401,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Get current member ID - in canonical schema: members.id == auth.user.id
    const { data: memberData } = await supabase
      .from("members")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!memberData) {
      return NextResponse.json({ active: null }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const memberId = memberData.id;

    // Find trips the member is attending (only confirmed)
    const { data: attendeesData } = await supabase
      .from("trip_attendees")
      .select("trip_id")
      .eq("member_id", memberId)
      .eq("status", "confirmed");

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
      return NextResponse.json({ active: null }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Find active gameday_rounds for these trips
    const { data: gamedayData, error: gamedayError } = await supabase
      .from("gameday_rounds")
      .select("trip_id,state,updated_at")
      .in("trip_id", allTripIds)
      .eq("state", "in_progress")
      .is("published_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (gamedayError || !gamedayData) {
      return NextResponse.json({ active: null }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Fetch trip details (include created_by_member_id for creator check)
    const { data: trip, error: tripError } = await supabase
      .from("trips")
      .select("id,group_id,name,trip_date,created_by_member_id")
      .eq("id", gamedayData.trip_id)
      .eq("trip_origin", "member")
      .single();

    if (tripError || !trip) {
      return NextResponse.json({ active: null }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Only return active GameDay for TODAY
    const today = todayInSGT();
    if (trip.trip_date !== today) {
      return NextResponse.json({ active: null }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // ATTENDEE CHECK: Verify user is an attendee of this specific trip
    // Check if member is a confirmed attendee of this specific trip
    const { data: attendeeCheck } = await supabase
      .from("trip_attendees")
      .select("member_id")
      .eq("trip_id", trip.id)
      .eq("member_id", memberId)
      .eq("status", "confirmed")
      .maybeSingle();

    // Check if member is the trip creator
    const isCreator = (trip as any).created_by_member_id === memberId;

    // Only return active if user is confirmed attendee OR creator
    if (!attendeeCheck && !isCreator) {
      return NextResponse.json({ active: null }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Generate label (use trip name or "Round #" format)
    const tripName = trip.name;
    const tripDate = trip.trip_date;
    const label = tripName || `Round on ${new Date(tripDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

    return NextResponse.json({
      active: {
        tripId: trip.id,
        groupId: (trip as any).group_id,
        state: gamedayData.state,
        label,
        updatedAt: gamedayData.updated_at,
      },
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Get active gameday error:", error);
    return NextResponse.json({ active: null }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
