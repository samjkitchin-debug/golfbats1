import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/mates
 * Returns recommended mates and search results for cross-group invites
 * 
 * Query params:
 * - query (optional): Search text
 * - limit (optional): Max results (default 50, max 100)
 * 
 * Response:
 * {
 *   ok: true,
 *   recommended: MemberLite[],
 *   results: MemberLite[]
 * }
 * 
 * MemberLite:
 * - id: string
 * - display_name: string | null
 * - full_name: string | null
 * - profile_photo_path: string | null
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

    // Get current member ID
    let currentMemberId: string | null = null;
    const { data: memberData } = await supabase
      .from("members")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    currentMemberId = memberData?.id || null;

    if (!currentMemberId) {
      return NextResponse.json({ error: "Member profile not found." }, { 
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query")?.trim() || "";
    const limitParam = searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam || "50", 10) || 50, 1), 100);

    // Get approved groups for current user
    const { data: memberships } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id)
      .eq("status", "approved");

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ ok: true, recommended: [], results: [] }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const groupIds = memberships.map((m) => m.group_id);

    // Get all approved member IDs from user's groups
    const { data: groupMembersData } = await supabase
      .from("group_members")
      .select("user_id")
      .in("group_id", groupIds)
      .eq("status", "approved");

    if (!groupMembersData || groupMembersData.length === 0) {
      return NextResponse.json({ ok: true, recommended: [], results: [] }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const allMemberIds = Array.from(new Set(groupMembersData.map((gm) => gm.user_id))).filter(
      (id) => id !== currentMemberId
    );

    if (allMemberIds.length === 0) {
      return NextResponse.json({ ok: true, recommended: [], results: [] }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Compute recommended mates based on co-attendance history
    // Top 12 members most recently co-attended with current user
    let recommendedMemberIds: string[] = [];

    // Get trip IDs where current user attended
    const { data: userTripsData } = await supabase
      .from("trip_attendees")
      .select("trip_id")
      .eq("member_id", currentMemberId)
      .eq("status", "confirmed");

    if (userTripsData && userTripsData.length > 0) {
      const userTripIds = userTripsData.map((t) => t.trip_id);

      // Find members who attended same trips
      const { data: coAttendeesData } = await supabase
        .from("trip_attendees")
        .select("member_id, trip_id, joined_at")
        .in("trip_id", userTripIds)
        .in("member_id", allMemberIds)
        .neq("member_id", currentMemberId)
        .eq("status", "confirmed")
        .order("joined_at", { ascending: false });

      if (coAttendeesData && coAttendeesData.length > 0) {
        // Count co-attendances per member and track most recent
        const coAttendanceCounts: Record<string, { count: number; lastAttended: string }> = {};
        for (const ca of coAttendeesData) {
          if (!coAttendanceCounts[ca.member_id]) {
            coAttendanceCounts[ca.member_id] = { count: 0, lastAttended: ca.joined_at };
          }
          coAttendanceCounts[ca.member_id].count++;
          if (ca.joined_at > coAttendanceCounts[ca.member_id].lastAttended) {
            coAttendanceCounts[ca.member_id].lastAttended = ca.joined_at;
          }
        }

        // Sort by count (desc) then last attended (desc), take top 12
        recommendedMemberIds = Object.entries(coAttendanceCounts)
          .sort((a, b) => {
            if (b[1].count !== a[1].count) {
              return b[1].count - a[1].count;
            }
            return b[1].lastAttended.localeCompare(a[1].lastAttended);
          })
          .slice(0, 12)
          .map(([memberId]) => memberId);
      }
    }

    // Fill remaining slots from approved groups if needed (up to 12 total)
    const recommendedIdsSet = new Set(recommendedMemberIds);
    if (recommendedIdsSet.size < 12) {
      const remainingIds = allMemberIds
        .filter((id) => !recommendedIdsSet.has(id))
        .slice(0, 12 - recommendedIdsSet.size);
      recommendedMemberIds = [...recommendedMemberIds, ...remainingIds];
    }

    // Fetch recommended member details
    let recommended: Array<{ id: string; display_name: string | null; full_name: string | null; profile_photo_path: string | null }> = [];
    if (recommendedMemberIds.length > 0) {
      const { data: recommendedMembersData } = await supabase
        .from("members")
        .select("id,display_name,full_name,profile_photo_path")
        .in("id", recommendedMemberIds);

      if (recommendedMembersData) {
        // Preserve order from recommendedMemberIds
        const memberMap = new Map(recommendedMembersData.map((m) => [m.id, m]));
        recommended = recommendedMemberIds
          .map((id) => memberMap.get(id))
          .filter((m): m is NonNullable<typeof m> => m !== undefined)
          .map((m) => ({
            id: m.id,
            display_name: m.display_name,
            full_name: m.full_name,
            profile_photo_path: m.profile_photo_path,
          }));
      }
    }

    // Handle search results
    let results: typeof recommended = [];
    if (query) {
      const { data: searchMembersData } = await supabase
        .from("members")
        .select("id,display_name,full_name,profile_photo_path")
        .in("id", allMemberIds)
        .or(`display_name.ilike.%${query}%,full_name.ilike.%${query}%`)
        .limit(limit);

      if (searchMembersData) {
        results = searchMembersData.map((m) => ({
          id: m.id,
          display_name: m.display_name,
          full_name: m.full_name,
          profile_photo_path: m.profile_photo_path,
        }));
      }
    }

    return NextResponse.json({ ok: true, recommended, results }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Get mates error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { 
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
