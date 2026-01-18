import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/handicap-status
 * Returns handicap type and eligible rounds count for the authenticated member.
 */
export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { 
        status: 401,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Fetch member's handicap_type
    const { data: member, error: memberErr } = await supabase
      .from("members")
      .select("handicap_type")
      .eq("id", user.id)
      .maybeSingle();

    if (memberErr) {
      return NextResponse.json(
        { error: "Failed to fetch member data." },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const handicapType = (member?.handicap_type || "declared_starter") as 
      "declared_starter" | "declared_established" | "dayforeit_official";

    // Count eligible rounds
    let eligibleRoundsCount = 0;

    // Primary: Try to count from handicap_rounds table (if exists)
    const handicapRoundsResult = await supabase
      .from("handicap_rounds")
      .select("id", { count: "exact", head: true })
      .eq("member_id", user.id)
      .eq("eligible", true)
      .maybeSingle();

    if (!handicapRoundsResult.error && handicapRoundsResult.count !== null && handicapRoundsResult.count !== undefined) {
      // handicap_rounds table exists and has eligible column
      eligibleRoundsCount = handicapRoundsResult.count || 0;
    } else {
      // Fallback: Count published trips where member has confirmed attendance
      // This is a temporary fallback until handicap_rounds is fully implemented.
      const { data: attendees, error: attendeesErr } = await supabase
        .from("trip_attendees")
        .select("trip_id, trips!inner(status)")
        .eq("member_id", user.id)
        .eq("status", "confirmed");

      if (!attendeesErr && attendees) {
        // Filter to only published trips (non-draft status)
        eligibleRoundsCount = attendees.filter((a: any) => {
          const trip = Array.isArray(a.trips) ? a.trips[0] : a.trips;
          return trip && trip.status !== "draft";
        }).length;
      }
    }

    // Calculate roundsToOfficial (0-5)
    const roundsToOfficial = Math.max(0, 5 - eligibleRoundsCount);

    return NextResponse.json(
      {
        ok: true,
        handicapType,
        eligibleRoundsCount,
        roundsToOfficial,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("[handicap-status API] Error:", error);
    return NextResponse.json(
      { error: "An error occurred while loading handicap status." },
      { 
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
