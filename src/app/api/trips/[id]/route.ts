import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

export const dynamic = "force-dynamic";

/**
 * GET /api/trips/[id]
 * Fetch full trip detail with attendees, logistics, results
 * Returns TripDetail (heavy payload) for trip detail pages
 * 
 * Route param: id (numeric legacy_id or UUID)
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    // Parse id - could be numeric legacy_id or UUID
    const parsedNumericId = parseInt(id, 10);
    const isNumeric = !isNaN(parsedNumericId);

    // Find trip by legacy_id or id (UUID)
    let tripQuery = supabase
      .from("trips")
      .select(
        "id,legacy_id,name,trip_name,trip_date,format,ferry,capacity,status,cutoff_at,course_id,tee_id,meeting_point,meet_time,ferry_details,notes,decision_logistics,logistics,created_at,updated_at,group_id,scenario_key,trip_origin,created_by_member_id,is_posted_to_group,travel_involved,travel_type,travel_scope,booking_approach,booking_provider_name,travel_note,coordination_status,signups_opened_at,phase_override"
      );

    if (isNumeric) {
      tripQuery = tripQuery.eq("legacy_id", parsedNumericId);
    } else {
      tripQuery = tripQuery.eq("id", id);
    }

    const { data: tripData, error: tripError } = await tripQuery.single();

    if (tripError || !tripData) {
      return NextResponse.json(
        { error: "Trip not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const tripId = tripData.id;

    // Fetch group name for hosted_by_label
    const groupId = tripData.group_id;
    const { data: groupData } = await supabase
      .from("groups")
      .select("name")
      .eq("id", groupId)
      .maybeSingle();
    const groupName = groupData?.name || null;

    // Get current member ID for filtering member trips visibility
    let currentMemberId: string | null = null;
    const { data: memberData } = await supabase
      .from("members")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    currentMemberId = memberData?.id || null;

    // Check visibility (for member trips)
    if (tripData.trip_origin === 'member') {
      const isPosted = tripData.is_posted_to_group !== false;
      const isCreator = tripData.created_by_member_id === currentMemberId;
      
      if (!isPosted && !isCreator) {
        return NextResponse.json(
          { error: "Trip not found." },
          { status: 404, headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    // Fetch creator name if member trip
    let createdByMemberName: string | null = null;
    if (tripData.created_by_member_id) {
      const { data: creatorData } = await supabase
        .from("members")
        .select("display_name,full_name")
        .eq("id", tripData.created_by_member_id)
        .maybeSingle();
      
      if (creatorData) {
        createdByMemberName = creatorData.display_name || creatorData.full_name || null;
      }
    }

    // Fetch attendees with member details
    const { data: attendeesData, error: attendeesError } = await supabase
      .from("trip_attendees")
      .select("trip_id,member_id,status,joined_at,handicap_snapshot")
      .eq("trip_id", tripId);

    if (attendeesError) {
      console.warn("[trips/[id] API] Failed to fetch attendees:", attendeesError);
    }

    const attendees = attendeesData || [];
    const memberIds = Array.from(new Set(attendees.map((a: any) => a.member_id).filter(Boolean)));

    // Fetch member profile data (public fields only - no passport/compliance data)
    const membersById: Record<string, { 
      display_name: string | null; 
      full_name: string | null;
      nationality: string | null;
    }> = {};

    if (memberIds.length > 0) {
      // Fetch members (profile fields only - no passport data)
      const { data: membersData, error: membersError } = await supabase
        .from("members")
        .select("id,display_name,full_name,nationality")
        .in("id", memberIds);

      if (membersError) {
        console.warn("[trips/[id] API] Failed to fetch members:", membersError);
      } else if (membersData) {
        for (const m of membersData) {
          membersById[m.id] = { 
            display_name: m.display_name, 
            full_name: m.full_name,
            nationality: m.nationality,
          };
        }
      }
    }

    // Fetch results
    const { data: resultData, error: resultError } = await supabase
      .from("trip_results")
      .select("id,trip_id,published,published_at,notes,result_rows(id,position,display_name,metric_label,metric_value)")
      .eq("trip_id", tripId)
      .maybeSingle();

    if (resultError) {
      console.warn("[trips/[id] API] Failed to fetch results:", resultError);
    }

    // Map attendees (public fields only - no compliance data)
    const tripAttendees = attendees.map((a: any) => {
      const member = membersById[a.member_id] || {};
      const name = member.display_name || member.full_name || "Unknown";
      
      return {
        name,
        status: a.status as "confirmed" | "waitlist" | "out",
        joinedAt: new Date(a.joined_at).getTime(),
        handicapForTrip: a.handicap_snapshot ?? null,
        memberId: a.member_id,
        // Include member profile fields (public only)
        fullName: member.full_name || null,
        displayName: member.display_name || null,
      };
    });

    // Build leaderboard if result exists and is published
    const resultRows = (resultData?.result_rows || []) as Array<{
      metric_label: string;
      position: number;
      display_name: string;
      metric_value: string;
    }>;
    
    const leaderboard =
      resultData && resultData.published
        ? resultRows
            .filter((r) => r.metric_label === "points")
            .sort((a, b) => b.position - a.position)
            .map((r) => ({
              name: r.display_name,
              points: Number(r.metric_value) || 0,
            }))
        : undefined;

    // Generate numeric ID
    let numericId: number;
    if (tripData.legacy_id) {
      numericId = tripData.legacy_id;
    } else {
      const uuid = tripData.id;
      let hash = 0;
      for (let i = 0; i < uuid.length; i++) {
        const char = uuid.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      numericId = Math.abs(hash) % 1000000 + 1000000;
    }

    // Parse decision_logistics JSON column (authoritative)
    let decisionLogistics: any = undefined;
    if ((tripData as any).decision_logistics) {
      try {
        decisionLogistics = typeof (tripData as any).decision_logistics === 'string'
          ? JSON.parse((tripData as any).decision_logistics)
          : (tripData as any).decision_logistics;
      } catch (e) {
        console.warn("[trips/[id] API] Failed to parse decision_logistics:", e);
      }
    }
    // Fallback to legacy flat columns only if JSON is missing
    if (!decisionLogistics && tripData.meeting_point && !tripData.ferry_details) {
      decisionLogistics = {
        meetingPoint: tripData.meeting_point || undefined,
        meetTime: tripData.meet_time || undefined,
      };
    }

    // Parse logistics JSON column (authoritative)
    let logistics: any = undefined;
    if ((tripData as any).logistics) {
      try {
        logistics = typeof (tripData as any).logistics === 'string'
          ? JSON.parse((tripData as any).logistics)
          : (tripData as any).logistics;
      } catch (e) {
        console.warn("[trips/[id] API] Failed to parse logistics:", e);
      }
    }
    // Fallback to legacy flat columns only if JSON is missing
    if (!logistics) {
      logistics = {
        meetingPoint: tripData.meeting_point || undefined,
        meetTime: tripData.meet_time || undefined,
        ferryDetails: tripData.ferry_details || undefined,
        notes: tripData.notes || undefined,
      };
    } else {
      // Merge missing fields from legacy flat columns (preserve existing keys like capacityConfirmed)
      logistics = {
        ...logistics,
        meetingPoint: logistics.meetingPoint ?? tripData.meeting_point ?? undefined,
        meetTime: logistics.meetTime ?? tripData.meet_time ?? undefined,
        ferryDetails: logistics.ferryDetails ?? tripData.ferry_details ?? undefined,
        notes: logistics.notes ?? tripData.notes ?? undefined,
      };
    }

    // Build TripDetail response
    const tripDetail = {
      id: numericId,
      name: tripData.name || undefined,
      tripName: (tripData as any).trip_name || undefined,
      date: tripData.trip_date,
      format: tripData.format,
      course: undefined,
      ferry: tripData.ferry || undefined,
      capacity: tripData.capacity,
      status: tripData.status as "open" | "closed" | "archived",
      cutoffAt: tripData.cutoff_at ? new Date(tripData.cutoff_at).toISOString() : undefined,
      courseId: tripData.course_id,
      teeId: tripData.tee_id,
      scenarioKey: (tripData as any).scenario_key || null,
      // Use parsed JSON columns as authoritative
      decisionLogistics,
      logistics,
      attendees: tripAttendees,
      result: resultData && resultData.published && leaderboard
        ? {
            leaderboard,
            notes: resultData.notes || undefined,
            publishedAt: resultData.published_at || undefined,
          }
        : undefined,
      createdAtUtc: tripData.created_at,
      updatedAtUtc: tripData.updated_at,
      tripOrigin: (tripData as any).trip_origin || 'group',
      createdByMemberId: (tripData as any).created_by_member_id || null,
      isPostedToGroup: (tripData as any).is_posted_to_group !== undefined ? (tripData as any).is_posted_to_group : true,
      createdByMemberName,
      // Compute canonical hosted_by_label
      hostedByLabel: (() => {
        const tripOrigin = (tripData as any).trip_origin || 'group';
        if (tripOrigin === 'group' && groupName) {
          return `Hosted by ${groupName}`;
        } else if (tripOrigin !== 'group' && createdByMemberName) {
          return `Hosted by ${createdByMemberName}`;
        }
        return undefined;
      })(),
      // Travel fields (group trips only)
      travelInvolved: (tripData as any).travel_involved !== undefined ? Boolean((tripData as any).travel_involved) : undefined,
      travelType: (tripData as any).travel_type || null,
      travelScope: (tripData as any).travel_scope || null,
      bookingApproach: (tripData as any).booking_approach || null,
      bookingProviderName: (tripData as any).booking_provider_name || null,
      travelNote: (tripData as any).travel_note || null,
      // Lifecycle-critical fields
      coordinationStatus: (tripData as any).coordination_status ?? null,
      signupsOpenedAt: (tripData as any).signups_opened_at ? new Date((tripData as any).signups_opened_at).toISOString() : undefined,
      phaseOverride: (tripData as any).phase_override ?? null,
      // Snake_case keys for UI/lifecycle consumers
      coordination_status: (tripData as any).coordination_status ?? null,
      signups_opened_at: (tripData as any).signups_opened_at ?? null,
      phase_override: (tripData as any).phase_override ?? null,
      // Group ID (canonical)
      groupId: (tripData as any).group_id ?? null,
      group_id: (tripData as any).group_id ?? null,
    };

    return NextResponse.json({ ok: true, trip: tripDetail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Get trip detail error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
