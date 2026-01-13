import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { getEffectiveCoordinationStatus, type TripEffectiveCoordinationStatus } from "@/app/lib/tripCoordination";
import { todayInSGT } from "@/app/lib/tripDates";

/**
 * GET /api/coordination/active
 * Returns the single active trip based on effective coordination status
 * 
 * Response:
 * {
 *   active: null | {
 *     tripId: string;                 // uuid
 *     tripLegacyId: number | null;    // legacy numeric id if available
 *     groupId: string;
 *     label: string;                  // trip name or "Golf day"
 *     effectiveStatus: 'today' | 'in_progress';
 *     resume: null | {
 *       route: string;                // absolute app path to resume GameDay
 *     };
 *     updatedAt: string;              // ISO
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

    // Determine candidate trips the user can see:
    // 1) Trips where user is a group member (approved status)
    // 2) Trips they are attending (trip_attendees)
    // 3) Trips they created (created_by_member_id)

    // Get groups where user is an approved member
    const { data: groupMembersData } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id)
      .eq("status", "approved");

    const groupIds = (groupMembersData || []).map((gm: any) => gm.group_id);

    // Get trips from user's groups
    let candidateTripIds: string[] = [];
    if (groupIds.length > 0) {
      const { data: groupTripsData } = await supabase
        .from("trips")
        .select("id")
        .in("group_id", groupIds);
      
      if (groupTripsData) {
        candidateTripIds.push(...groupTripsData.map((t: any) => t.id));
      }
    }

    // Get trips user is attending
    const { data: attendeesData } = await supabase
      .from("trip_attendees")
      .select("trip_id")
      .eq("member_id", memberId);
    
    if (attendeesData) {
      candidateTripIds.push(...attendeesData.map((a: any) => a.trip_id));
    }

    // Get trips user created
    const { data: createdTripsData } = await supabase
      .from("trips")
      .select("id")
      .eq("created_by_member_id", memberId);
    
    if (createdTripsData) {
      candidateTripIds.push(...createdTripsData.map((t: any) => t.id));
    }

    // Deduplicate
    const uniqueTripIds = [...new Set(candidateTripIds)];

    if (uniqueTripIds.length === 0) {
      return NextResponse.json({ active: null });
    }

    // Fetch trips data
    const { data: tripsData, error: tripsError } = await supabase
      .from("trips")
      .select("id,legacy_id,group_id,name,trip_date,coordination_status,updated_at")
      .in("id", uniqueTripIds);

    if (tripsError || !tripsData || tripsData.length === 0) {
      return NextResponse.json({ active: null });
    }

    // Fetch gameday_rounds data for all candidate trips
    const { data: gamedayData, error: gamedayError } = await supabase
      .from("gameday_rounds")
      .select("trip_id,state,published_at,updated_at")
      .in("trip_id", uniqueTripIds);

    if (gamedayError) {
      console.error("[coordination/active] Failed to fetch gameday_rounds:", gamedayError);
    }

    // Build map of trip_id -> hasInProgressGameDay
    const gamedayMap = new Map<string, { hasInProgress: boolean; updatedAt: string | null }>();
    (gamedayData || []).forEach((gd: any) => {
      const hasInProgress = gd.state === 'in_progress' && gd.published_at === null;
      const existing = gamedayMap.get(gd.trip_id);
      if (!existing || (hasInProgress && (!existing.hasInProgress || (gd.updated_at && (!existing.updatedAt || gd.updated_at > existing.updatedAt))))) {
        gamedayMap.set(gd.trip_id, {
          hasInProgress,
          updatedAt: gd.updated_at,
        });
      }
    });

    // Get today's date in Asia/Singapore
    const todayYmd = todayInSGT();

    // Compute effective status for each trip
    type TripWithEffectiveStatus = {
      trip: any;
      effectiveStatus: TripEffectiveCoordinationStatus;
      gamedayUpdatedAt: string | null;
    };

    const tripsWithEffectiveStatus: TripWithEffectiveStatus[] = tripsData.map((trip: any) => {
      const gamedayInfo = gamedayMap.get(trip.id) || { hasInProgress: false, updatedAt: null };
      const effectiveStatus = getEffectiveCoordinationStatus({
        coordinationStatus: trip.coordination_status,
        tripDateYmd: trip.trip_date,
        todayYmd,
        hasInProgressGameDay: gamedayInfo.hasInProgress,
      });
      return {
        trip,
        effectiveStatus,
        gamedayUpdatedAt: gamedayInfo.updatedAt,
      };
    });

    // Filter to only trips with dominant statuses ('today' or 'in_progress')
    const activeCandidates = tripsWithEffectiveStatus.filter(
      (t) => t.effectiveStatus === 'today' || t.effectiveStatus === 'in_progress'
    );

    if (activeCandidates.length === 0) {
      return NextResponse.json({ active: null });
    }

    // Choose the single active item:
    // Priority:
    // - Any trip with effectiveStatus == 'in_progress' (choose the one with most recent gameday_rounds.updated_at desc)
    // - Else any trip with effectiveStatus == 'today' (choose earliest trip_date then most recent trips.updated_at)
    const inProgressTrips = activeCandidates.filter((t) => t.effectiveStatus === 'in_progress');
    let selected: TripWithEffectiveStatus;

    if (inProgressTrips.length > 0) {
      // Sort by gameday_rounds.updated_at desc, then by trips.updated_at desc
      inProgressTrips.sort((a, b) => {
        const aGamedayAt = a.gamedayUpdatedAt || '';
        const bGamedayAt = b.gamedayUpdatedAt || '';
        if (aGamedayAt !== bGamedayAt) {
          return bGamedayAt.localeCompare(aGamedayAt);
        }
        return (b.trip.updated_at || '').localeCompare(a.trip.updated_at || '');
      });
      selected = inProgressTrips[0];
    } else {
      // Only 'today' trips
      const todayTrips = activeCandidates.filter((t) => t.effectiveStatus === 'today');
      // Sort by trip_date asc (earliest first), then by trips.updated_at desc
      todayTrips.sort((a, b) => {
        const dateCompare = a.trip.trip_date.localeCompare(b.trip.trip_date);
        if (dateCompare !== 0) {
          return dateCompare;
        }
        return (b.trip.updated_at || '').localeCompare(a.trip.updated_at || '');
      });
      selected = todayTrips[0];
    }

    // Build response
    const trip = selected.trip;
    const effectiveStatus = selected.effectiveStatus as 'today' | 'in_progress';

    // Generate label (use trip name or "Golf day")
    const label = trip.name || "Golf day";

    // Generate route: /gameday/[id] where id is legacy_id if available, else UUID
    // If legacy_id exists, use it; otherwise use UUID
    const routeId = trip.legacy_id ? String(trip.legacy_id) : trip.id;
    const route = `/gameday/${routeId}`;

    // Get legacy_id or null
    const tripLegacyId = trip.legacy_id ? Number(trip.legacy_id) : null;

    // Use gameday_rounds.updated_at if available and in_progress, else trips.updated_at
    const updatedAt = (effectiveStatus === 'in_progress' && selected.gamedayUpdatedAt) 
      ? selected.gamedayUpdatedAt 
      : trip.updated_at;

    return NextResponse.json({
      active: {
        tripId: trip.id,
        tripLegacyId,
        groupId: trip.group_id,
        label,
        effectiveStatus,
        resume: {
          route,
        },
        updatedAt,
      },
    });
  } catch (error) {
    console.error("[coordination/active] Error:", error);
    return NextResponse.json({ active: null });
  }
}
