import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * GET /api/gameday/[roundId]/course-pack
 * Returns heavy course data (tee + holes) for GameDay scoring
 * 
 * Response:
 * {
 *   ok: true,
 *   coursePack: {
 *     course: { id, name, location },
 *     tee: { id, label, meters, par, slope, rating },
 *     holes: Array<{ holeNumber, par, meters, strokeIndex }>
 *   }
 * }
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ roundId: string }> }
) {
  try {
    const { roundId } = await params;
    const supabase = await createSupabaseServerClient();
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // Parse roundId - could be numeric legacy_id or UUID
    const numericId = parseInt(roundId, 10);
    const isNumeric = !isNaN(numericId);

    // Find trip by legacy_id or id (UUID)
    let tripQuery = supabase
      .from("trips")
      .select("id,group_id,course_id,tee_id")
      .eq("trip_origin", "member"); // GameDay is only for member-hosted rounds

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

    if (!tripData.tee_id) {
      return NextResponse.json(
        { ok: false, error: "missing_tee" },
        { status: 400 }
      );
    }

    if (!tripData.course_id) {
      return NextResponse.json(
        { ok: false, error: "missing_course" },
        { status: 400 }
      );
    }

    // Fetch course
    const { data: courseData, error: courseError } = await supabase
      .from("courses")
      .select("id,name,location")
      .eq("id", tripData.course_id)
      .single();

    if (courseError || !courseData) {
      return NextResponse.json(
        { ok: false, error: "course_not_found" },
        { status: 404 }
      );
    }

    // Fetch tee
    const { data: teeData, error: teeError } = await supabase
      .from("tees")
      .select("id,label,meters,par,slope,rating")
      .eq("id", tripData.tee_id)
      .single();

    if (teeError || !teeData) {
      return NextResponse.json(
        { ok: false, error: "tee_not_found" },
        { status: 404 }
      );
    }

    // Fetch holes
    const { data: holesData, error: holesError } = await supabase
      .from("tee_holes")
      .select("hole_number,par,meters,stroke_index")
      .eq("tee_id", tripData.tee_id)
      .order("hole_number", { ascending: true });

    if (holesError) {
      return NextResponse.json(
        { ok: false, error: "failed_to_fetch_holes" },
        { status: 500 }
      );
    }

    // Transform holes to camelCase
    const holes = (holesData || []).map((h) => ({
      holeNumber: h.hole_number,
      par: h.par,
      meters: h.meters,
      strokeIndex: h.stroke_index,
    }));

    return NextResponse.json({
      ok: true,
      coursePack: {
        course: {
          id: courseData.id,
          name: courseData.name,
          location: courseData.location || "",
        },
        tee: {
          id: teeData.id,
          label: teeData.label,
          meters: teeData.meters,
          par: teeData.par,
          slope: teeData.slope,
          rating: teeData.rating,
        },
        holes,
      },
    });
  } catch (error) {
    console.error("Get course-pack error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
