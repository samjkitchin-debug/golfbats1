import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * GET /api/trips
 * Retrieve all trips with attendees and results
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    // Fetch trips
    const { data: tripsData, error: tripsError } = await supabase
      .from("trips")
      .select("*")
      .order("trip_date", { ascending: false });

    if (tripsError) {
      return NextResponse.json(
        { error: tripsError.message || "Failed to fetch trips." },
        { status: 400 }
      );
    }

    if (!tripsData || tripsData.length === 0) {
      return NextResponse.json({ ok: true, trips: [] });
    }

    // Fetch attendees for all trips
    const tripIds = tripsData.map((t) => t.id);
    const { data: attendeesData, error: attendeesError } = await supabase
      .from("trip_attendees")
      .select("*,members(id,display_name,full_name)")
      .in("trip_id", tripIds);

    if (attendeesError) {
      console.warn("Failed to fetch attendees:", attendeesError);
    }

    // Fetch results for all trips
    const { data: resultsData, error: resultsError } = await supabase
      .from("trip_results")
      .select("*,result_rows(*)")
      .in("trip_id", tripIds);

    if (resultsError) {
      console.warn("Failed to fetch results:", resultsError);
    }

    // Map database trips to UI Trip format
    const trips = tripsData.map((trip) => {
      const attendees = (attendeesData || [])
        .filter((a) => a.trip_id === trip.id)
        .map((a) => {
          const member = a.members as any;
          const name = member?.display_name || member?.full_name || "Unknown";
          return {
            name,
            status: a.status as "confirmed" | "waitlist" | "out",
            joinedAt: new Date(a.joined_at).getTime(),
            handicapForTrip: a.handicap_snapshot ?? null,
          };
        });

      const result = (resultsData || []).find((r) => r.trip_id === trip.id);
      const resultRows = result?.result_rows || [];
      const leaderboard = resultRows
        .filter((r: any) => r.metric_label === "points")
        .sort((a: any, b: any) => b.position - a.position)
        .map((r: any) => ({
          name: r.display_name,
          points: Number(r.metric_value) || 0,
        }));

      return {
        id: trip.legacy_id || 0, // Use legacy_id as numeric ID for UI compatibility
        name: undefined, // Not in schema
        date: trip.trip_date,
        format: trip.format,
        course: undefined, // Legacy field
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
    });

    return NextResponse.json({ ok: true, trips });
  } catch (error) {
    console.error("Get trips error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

