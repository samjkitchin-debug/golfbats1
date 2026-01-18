import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * GET /api/courses/[courseId]/tees/[teeId]/pack
 * Returns course and tee pack information including holes
 * 
 * Response:
 * {
 *   ok: true,
 *   course: { id: string, name: string, lat: number | null, lng: number | null },
 *   tee: { id: string, label: string, par: number, slope: number, rating: number | null },
 *   holes: Array<{ holeNumber: number, par: number | null, strokeIndex: number | null, meters: number | null }>,
 *   packQuality: "complete" | "incomplete",
 *   packVersion: string
 * }
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ courseId: string; teeId: string }> }
) {
  try {
    const { courseId, teeId } = await params;
    const supabase = await createSupabaseServerClient();
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // Fetch course
    const { data: courseData, error: courseError } = await supabase
      .from("courses")
      .select("id,name,lat,lng")
      .eq("id", courseId)
      .maybeSingle();

    if (courseError || !courseData) {
      return NextResponse.json(
        { ok: false, error: "Course not found" },
        { status: 404 }
      );
    }

    // Fetch tee
    const { data: teeData, error: teeError } = await supabase
      .from("tees")
      .select("id,label,par,slope,rating,updated_at,created_at")
      .eq("id", teeId)
      .eq("course_id", courseId)
      .maybeSingle();

    if (teeError || !teeData) {
      return NextResponse.json(
        { ok: false, error: "Tee not found" },
        { status: 404 }
      );
    }

    // Fetch tee holes
    const { data: holesData, error: holesError } = await supabase
      .from("tee_holes")
      .select("hole_number,par,stroke_index,meters,created_at")
      .eq("tee_id", teeId)
      .order("hole_number", { ascending: true });

    if (holesError) {
      console.error("[pack GET] Failed to fetch tee holes:", holesError);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch holes" },
        { status: 500 }
      );
    }

    // Map holes data
    const holes = (holesData || []).map((h: any) => ({
      holeNumber: h.hole_number,
      par: h.par,
      strokeIndex: h.stroke_index,
      meters: h.meters,
    }));

    // Compute packQuality: "complete" only if all 18 holes have par and stroke_index non-null
    const packQuality = 
      holes.length === 18 &&
      holes.every(h => h.par !== null && h.strokeIndex !== null)
        ? "complete"
        : "incomplete";

    // Compute packVersion: stable string from tee.updated_at + max(tee_holes.created_at)
    // Use ISO timestamps, concatenated, then hashed or formatted for stability
    const teeUpdatedAt = teeData.updated_at || teeData.created_at || "";
    const maxHoleCreatedAt = holesData && holesData.length > 0
      ? holesData.reduce((max: string, h: any) => {
          const holeCreated = h.created_at || "";
          return holeCreated > max ? holeCreated : max;
        }, "")
      : "";

    // Create stable version string: tee_updated_at + max_hole_created_at (ISO timestamps)
    // Normalize timestamps to ISO format for consistent string representation
    const teeTimestamp = teeUpdatedAt ? new Date(teeUpdatedAt).toISOString() : "";
    const holeTimestamp = maxHoleCreatedAt ? new Date(maxHoleCreatedAt).toISOString() : "";
    const packVersion = `${teeTimestamp}|${holeTimestamp}`;

    return NextResponse.json({
      ok: true,
      course: {
        id: courseData.id,
        name: courseData.name,
        lat: courseData.lat,
        lng: courseData.lng,
      },
      tee: {
        id: teeData.id,
        label: teeData.label,
        par: teeData.par,
        slope: teeData.slope,
        rating: teeData.rating,
      },
      holes,
      packQuality,
      packVersion,
    });
  } catch (error) {
    console.error("Get course/tee pack error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
