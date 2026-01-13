import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { todayInSGT } from "@/app/lib/tripDates";

/**
 * POST /api/coordination/trips-status
 * Batch endpoint to get effective coordination status data for multiple trips
 * 
 * Request:
 * {
 *   tripIds: string[]  // Array of trip UUIDs (max 200)
 * }
 * 
 * Response:
 * {
 *   todayYmd: string,              // YYYY-MM-DD in Asia/Singapore
 *   inProgressTripIds: string[]     // Subset of tripIds that have in_progress gameday_rounds with published_at IS NULL
 * }
 */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { tripIds } = body as { tripIds?: (string | number)[] };

    if (!tripIds || !Array.isArray(tripIds)) {
      return NextResponse.json(
        { error: "tripIds array is required" },
        { status: 400 }
      );
    }

    // Limit to safe max (200 trips)
    const limitedTripIds = tripIds.slice(0, 200);

    if (limitedTripIds.length === 0) {
      // Return empty result if no trip IDs
      const todayYmd = todayInSGT();
      return NextResponse.json({
        todayYmd,
        inProgressTripIds: [],
        inProgressLegacyIds: [],
      });
    }

    // Convert numeric IDs (legacy_id) to UUIDs by querying trips table
    // First, separate UUIDs from numeric IDs
    const numericIds: number[] = [];
    const uuidIds: string[] = [];
    
    for (const id of limitedTripIds) {
      if (typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id))) {
        numericIds.push(Number(id));
      } else {
        uuidIds.push(String(id));
      }
    }

    // Fetch UUIDs for numeric IDs
    let allUuidIds = [...uuidIds];
    if (numericIds.length > 0) {
      const { data: tripsData } = await supabase
        .from("trips")
        .select("id")
        .in("legacy_id", numericIds);
      
      if (tripsData) {
        allUuidIds.push(...tripsData.map((t: any) => t.id));
      }
    }

    if (allUuidIds.length === 0) {
      const todayYmd = todayInSGT();
      return NextResponse.json({
        todayYmd,
        inProgressTripIds: [],
        inProgressLegacyIds: [],
      });
    }

    // Query gameday_rounds where trip_id IN allUuidIds AND state='in_progress' AND published_at IS NULL
    const { data: gamedayData, error: gamedayError } = await supabase
      .from("gameday_rounds")
      .select("trip_id")
      .in("trip_id", allUuidIds)
      .eq("state", "in_progress")
      .is("published_at", null);

    if (gamedayError) {
      console.error("[coordination/trips-status] Failed to fetch gameday_rounds:", gamedayError);
      // Return partial result with empty inProgressTripIds
      const todayYmd = todayInSGT();
      return NextResponse.json({
        todayYmd,
        inProgressTripIds: [],
        inProgressLegacyIds: [],
      });
    }

    // Extract distinct trip UUIDs
    const inProgressUuidIds = Array.from(
      new Set((gamedayData || []).map((gd: any) => gd.trip_id))
    );

    // Map UUIDs back to legacy_ids for easier client-side matching
    let inProgressLegacyIds: number[] = [];
    if (inProgressUuidIds.length > 0) {
      const { data: tripsData } = await supabase
        .from("trips")
        .select("legacy_id")
        .in("id", inProgressUuidIds);
      
      if (tripsData) {
        inProgressLegacyIds = tripsData
          .map((t: any) => t.legacy_id)
          .filter((id: any) => id !== null && id !== undefined)
          .map(Number);
      }
    }

    // Get today's date in Asia/Singapore
    const todayYmd = todayInSGT();

    return NextResponse.json({
      todayYmd,
      inProgressTripIds: inProgressUuidIds, // Keep UUIDs for backward compatibility
      inProgressLegacyIds, // Add numeric IDs for easier client-side matching
    });
  } catch (error) {
    console.error("[coordination/trips-status] Error:", error);
    // Return safe fallback
    const todayYmd = todayInSGT();
    return NextResponse.json({
      todayYmd,
      inProgressTripIds: [],
      inProgressLegacyIds: [],
    });
  }
}
