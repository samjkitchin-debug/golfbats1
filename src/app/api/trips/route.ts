import { NextResponse } from "next/server";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

const CACHE_TAG = "trips";
const CACHE_TTL = 10; // 10 seconds (reduced from 30 to help with stale data issues)

/**
 * Cached data fetcher (request-scoped memoization + cross-request caching)
 */
const getTripsData = cache(
  unstable_cache(
    async () => {
      const supabase = await createSupabaseServerClient();

  // Fetch trips
  const { data: tripsData, error: tripsError } = await supabase
    .from("trips")
    .select("*")
    .order("trip_date", { ascending: false });

  if (tripsError) {
    throw new Error(tripsError.message || "Failed to fetch trips.");
  }

  if (!tripsData || tripsData.length === 0) {
    return { ok: true, trips: [] };
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
      name: trip.name || undefined,
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

  return { ok: true, trips };
    },
    ["trips-list"],
    {
      tags: [CACHE_TAG],
      revalidate: CACHE_TTL,
    }
  )
);

/**
 * GET /api/trips
 * Retrieve all trips with attendees and results (cached)
 * Query param ?bypassCache=true to force fresh data
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const bypassCache = url.searchParams.get("bypassCache") === "true";
    
    if (bypassCache) {
      // Bypass cache and fetch fresh data
      const supabase = await createSupabaseServerClient();
      
      const { data: tripsData, error: tripsError } = await supabase
        .from("trips")
        .select("*")
        .order("trip_date", { ascending: false });

      if (tripsError) {
        throw new Error(tripsError.message || "Failed to fetch trips.");
      }

      if (!tripsData || tripsData.length === 0) {
        return NextResponse.json({ ok: true, trips: [] });
      }

      const tripIds = tripsData.map((t) => t.id);
      const { data: attendeesData } = await supabase
        .from("trip_attendees")
        .select("*,members(id,display_name,full_name)")
        .in("trip_id", tripIds);

      const { data: resultsData } = await supabase
        .from("trip_results")
        .select("*,result_rows(*)")
        .in("trip_id", tripIds);

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
          id: trip.legacy_id || 0,
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
    }
    
    const result = await getTripsData();
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
 * Create or update a trip
 * Body: { trip: Trip, id?: number } - if id provided, updates; otherwise creates
 */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const body = await req.json();
    const { trip, id } = body as { trip: any; id?: number };

    if (!trip) {
      return NextResponse.json({ error: "Trip data is required." }, { status: 400 });
    }

    // Get club_id
    const clubSlug = process.env.NEXT_PUBLIC_CLUB_SLUG || "golfbats";
    const { data: clubData } = await supabase
      .from("clubs")
      .select("id")
      .eq("slug", clubSlug)
      .single();

    if (!clubData) {
      return NextResponse.json(
        { error: `Club not found for slug: ${clubSlug}` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    if (id) {
      // Update existing trip - find by legacy_id
      const { data: existingTrip } = await supabase
        .from("trips")
        .select("id")
        .eq("legacy_id", id)
        .single();

      if (!existingTrip) {
        return NextResponse.json({ error: "Trip not found." }, { status: 404 });
      }

      const updateData: any = {
        name: trip.name || null,
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
      // Get next legacy_id
      const { data: maxTrip } = await supabase
        .from("trips")
        .select("legacy_id")
        .order("legacy_id", { ascending: false })
        .limit(1)
        .single();

      const nextLegacyId = maxTrip?.legacy_id ? Number(maxTrip.legacy_id) + 1 : 1;

      const tripId = crypto.randomUUID();
      const insertData: any = {
        id: tripId,
        club_id: clubData.id,
        legacy_id: nextLegacyId,
        name: trip.name || null,
        trip_date: trip.date || new Date().toISOString().slice(0, 10),
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
 * Delete a trip
 * Body: { id: number } - legacy_id
 */
export async function DELETE(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const body = await req.json();
    const { id } = body as { id?: number };

    if (!id) {
      return NextResponse.json({ error: "Trip ID is required." }, { status: 400 });
    }

    // Find trip by legacy_id
    const { data: trip } = await supabase
      .from("trips")
      .select("id")
      .eq("legacy_id", id)
      .single();

    if (!trip) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
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

