import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * GET /api/courses
 * Retrieve all courses with their tees
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    // Fetch courses
    const { data: coursesData, error: coursesError } = await supabase
      .from("courses")
      .select("id,name,location,website")
      .order("name", { ascending: true });

    if (coursesError) {
      return NextResponse.json(
        { error: coursesError.message || "Failed to fetch courses." },
        { status: 400 }
      );
    }

    if (!coursesData || coursesData.length === 0) {
      return NextResponse.json({ ok: true, courses: [] });
    }

    // Fetch all tees for these courses
    const courseIds = coursesData.map((c) => c.id);
    const { data: teesData, error: teesError } = await supabase
      .from("tees")
      .select("id,course_id,label,meters,par,slope")
      .in("course_id", courseIds);

    if (teesError) {
      console.warn("Failed to fetch tees:", teesError);
    }

    // Combine courses with their tees
    const courses = coursesData.map((course) => {
      const tees = (teesData || [])
        .filter((t) => t.course_id === course.id)
        .map((t) => ({
          id: t.id,
          label: t.label,
          meters: t.meters,
          par: t.par,
          slope: t.slope,
        }));

      return {
        id: course.id,
        name: course.name,
        location: course.location || "",
        website: course.website,
        tees,
      };
    });

    return NextResponse.json({ ok: true, courses });
  } catch (error) {
    console.error("Get courses error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

