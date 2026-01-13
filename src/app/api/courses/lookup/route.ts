import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * GET /api/courses/lookup
 * Lightweight course lookup endpoint for setup flows (e.g., Host Round)
 * Returns courses with minimal tee information (id, label only)
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    // Fetch courses
    const { data: coursesData, error: coursesError } = await supabase
      .from("courses")
      .select("id,name,location")
      .order("name", { ascending: true });

    if (coursesError) {
      return NextResponse.json(
        { error: coursesError.message || "Failed to fetch courses." },
        { status: 500 }
      );
    }

    if (!coursesData || coursesData.length === 0) {
      return NextResponse.json({ ok: true, courses: [] });
    }

    // Fetch all tees for these courses (id, label only)
    const courseIds = coursesData.map((c) => c.id);
    const { data: teesData, error: teesError } = await supabase
      .from("tees")
      .select("id,course_id,label")
      .in("course_id", courseIds)
      .order("label", { ascending: true });

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
        }));

      return {
        id: course.id,
        name: course.name,
        location: course.location || "",
        tees,
      };
    });

    return NextResponse.json({ ok: true, courses });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
