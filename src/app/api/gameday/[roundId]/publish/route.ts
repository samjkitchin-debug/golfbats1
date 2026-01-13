import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";

/**
 * POST /api/gameday/[roundId]/publish
 * Publishes GameDay results (idempotent)
 * 
 * Response:
 * {
 *   ok: true,
 *   publishedAt: string,
 *   result: { tripResultId: string, rowsCreated: number },
 *   handicap: { roundsUpserted: number, indexUpserted: number }
 * }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ roundId: string }> }
) {
  try {
    const { roundId } = await params;
    const supabase = await createSupabaseServerClient();
    const supabaseService = await createSupabaseServiceClient();
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // Parse roundId
    const numericId = parseInt(roundId, 10);
    const isNumeric = !isNaN(numericId);

    // 1) Load trip
    let tripQuery = supabase
      .from("trips")
      .select("id,group_id,trip_date,format,course_id,tee_id")
      .eq("trip_origin", "member");

    if (isNumeric) {
      tripQuery = tripQuery.eq("legacy_id", numericId);
    } else {
      tripQuery = tripQuery.eq("id", roundId);
    }

    const { data: tripData, error: tripError } = await tripQuery.single();

    if (tripError || !tripData) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 }
      );
    }

    // 2) Load gameday_rounds
    const { data: gamedayData, error: gamedayError } = await supabase
      .from("gameday_rounds")
      .select("state")
      .eq("trip_id", tripData.id)
      .maybeSingle();

    const currentState = gamedayData?.state || "not_started";

    // If already published, return idempotent success
    if (currentState === "published") {
      const { data: existingResult } = await supabaseService
        .from("trip_results")
        .select("id,published_at")
        .eq("trip_id", tripData.id)
        .maybeSingle();

      return NextResponse.json({
        ok: true,
        publishedAt: existingResult?.published_at || new Date().toISOString(),
        result: { tripResultId: existingResult?.id || "", rowsCreated: 0 },
        handicap: { roundsUpserted: 0, indexUpserted: 0 },
      });
    }

    // Require state == 'closed'
    if (currentState !== "closed") {
      return NextResponse.json(
        { ok: false, error: "not_closed" },
        { status: 400 }
      );
    }

    // 3) Load participants
    const { data: attendeesData, error: attendeesError } = await supabase
      .from("trip_attendees")
      .select("member_id,status,handicap_snapshot")
      .eq("trip_id", tripData.id)
      .eq("status", "confirmed");

    if (attendeesError) {
      console.warn("[publish] Failed to fetch attendees:", attendeesError);
    }

    const attendeeMemberIds = (attendeesData || []).map((a: any) => a.member_id).filter(Boolean);

    const participants: Array<{ memberId: string; displayName: string; handicapSnapshot: number | null }> = [];
    if (attendeeMemberIds.length > 0) {
      const { data: membersData, error: membersError } = await supabase
        .from("members")
        .select("id,display_name,full_name")
        .in("id", attendeeMemberIds);

      if (membersError) {
        console.warn("[publish] Failed to fetch members:", membersError);
      } else if (membersData) {
        for (const m of membersData) {
          const attendee = attendeesData?.find((a: any) => a.member_id === m.id);
          participants.push({
            memberId: m.id,
            displayName: m.display_name || m.full_name || "Unknown",
            handicapSnapshot: attendee?.handicap_snapshot || null,
          });
        }
      }
    }

    // 4) Load scores
    const { data: scoresData, error: scoresError } = await supabase
      .from("gameday_scores")
      .select("member_id,hole_number,strokes")
      .eq("trip_id", tripData.id);

    if (scoresError) {
      console.warn("[publish] Failed to fetch scores:", scoresError);
    }

    // 5) Compute totals
    const memberTotals: Map<string, { total: number; complete: boolean; holes: number }> = new Map();

    for (const participant of participants) {
      const memberScores = (scoresData || []).filter((s: any) => s.member_id === participant.memberId);
      const total = memberScores.reduce((sum: number, s: any) => sum + s.strokes, 0);
      const holes = memberScores.length;
      const complete = holes === 18;

      memberTotals.set(participant.memberId, { total, complete, holes });
    }

    // Sort: complete first by ascending total, then incomplete
    const sortedParticipants = [...participants].sort((a, b) => {
      const aData = memberTotals.get(a.memberId)!;
      const bData = memberTotals.get(b.memberId)!;

      if (aData.complete && !bData.complete) return -1;
      if (!aData.complete && bData.complete) return 1;
      if (aData.complete && bData.complete) {
        return aData.total - bData.total;
      }
      return 0; // Both incomplete, maintain order
    });

    // 6) Upsert trip_results
    const now = new Date().toISOString();
    const { data: existingResult } = await supabaseService
      .from("trip_results")
      .select("id")
      .eq("trip_id", tripData.id)
      .maybeSingle();

    const resultId = existingResult?.id || crypto.randomUUID();

    const { error: resultErr } = await supabaseService.from("trip_results").upsert(
      {
        id: resultId,
        trip_id: tripData.id,
        group_id: tripData.group_id,
        published: true,
        published_at: existingResult ? undefined : now,
        notes: tripData.format !== "Stroke" ? `Totals published (${tripData.format})` : null,
        updated_at: now,
        ...(existingResult ? {} : { created_at: now }),
      },
      { onConflict: "id" }
    );

    if (resultErr) {
      return NextResponse.json(
        { ok: false, error: resultErr.message || "Failed to save result" },
        { status: 500 }
      );
    }

    // 7) Replace result_rows
    await supabaseService.from("result_rows").delete().eq("result_id", resultId);

    const resultRows = sortedParticipants.map((participant, index) => {
      const data = memberTotals.get(participant.memberId)!;
      return {
        id: crypto.randomUUID(),
        result_id: resultId,
        position: index + 1,
        display_name: participant.displayName,
        metric_label: "Total Strokes",
        metric_value: data.complete ? String(data.total) : "Incomplete",
      };
    });

    const { error: rowsErr } = await supabaseService.from("result_rows").insert(resultRows);

    if (rowsErr) {
      return NextResponse.json(
        { ok: false, error: rowsErr.message || "Failed to save leaderboard" },
        { status: 500 }
      );
    }

    // 8) Handicap history writes
    let roundsUpserted = 0;
    let indexUpserted = 0;

    if (tripData.tee_id) {
      // Load locked tee info
      const { data: teeData } = await supabase
        .from("tees")
        .select("slope,rating,par")
        .eq("id", tripData.tee_id)
        .single();

      for (const participant of participants) {
        const data = memberTotals.get(participant.memberId)!;

        // Upsert handicap_rounds
        const handicapRoundData: any = {
          group_id: tripData.group_id,
          trip_id: tripData.id,
          member_id: participant.memberId,
          played_on: tripData.trip_date,
          course_id: tripData.course_id,
          tee_id: tripData.tee_id,
          gross_total_strokes: data.complete ? data.total : null,
          handicap_snapshot: participant.handicapSnapshot,
          course_rating: teeData?.rating || null,
          slope: teeData?.slope || null,
          par: teeData?.par || null,
          differential: null, // v1: not computed
        };

        const { error: roundErr } = await supabaseService
          .from("handicap_rounds")
          .upsert(handicapRoundData, { onConflict: "trip_id,member_id" });

        if (!roundErr) {
          roundsUpserted++;
        }

        // Upsert member_handicap_index (only set current_index if null)
        const { data: existingIndex } = await supabaseService
          .from("member_handicap_index")
          .select("current_index")
          .eq("group_id", tripData.group_id)
          .eq("member_id", participant.memberId)
          .maybeSingle();

        const indexData: any = {
          group_id: tripData.group_id,
          member_id: participant.memberId,
          updated_at: now,
        };

        // Only set current_index if it's null (preserve existing)
        if (!existingIndex || existingIndex.current_index === null) {
          indexData.current_index = participant.handicapSnapshot;
        }

        const { error: indexErr } = await supabaseService
          .from("member_handicap_index")
          .upsert(indexData, { onConflict: "group_id,member_id" });

        if (!indexErr) {
          indexUpserted++;
        }
      }
    }

    // 9) Update gameday_rounds state to 'published'
    const { error: gamedayUpdateErr } = await supabaseService
      .from("gameday_rounds")
      .update({
        state: "published",
        published_at: now,
        updated_at: now,
      })
      .eq("trip_id", tripData.id);

    if (gamedayUpdateErr) {
      console.warn("[publish] Failed to update gameday_rounds:", gamedayUpdateErr);
    }

    return NextResponse.json({
      ok: true,
      publishedAt: now,
      result: {
        tripResultId: resultId,
        rowsCreated: resultRows.length,
      },
      handicap: {
        roundsUpserted,
        indexUpserted,
      },
    });
  } catch (error) {
    console.error("Publish gameday error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
