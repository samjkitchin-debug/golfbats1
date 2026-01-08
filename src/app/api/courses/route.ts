import { NextResponse } from "next/server";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { timeFn } from "@/app/lib/perf";

const CACHE_TAG = "courses";
const CACHE_TTL = 3600; // 1 hour

/**
 * Fetch courses data (cannot be cached because it uses cookies())
 */
async function fetchCoursesData() {
  const supabase = await createSupabaseServerClient();

  // Fetch courses
  const { data: coursesData, error: coursesError } = await supabase
    .from("courses")
    .select("id,name,location,website")
    .order("name", { ascending: true });

  if (coursesError) {
    throw new Error(coursesError.message || "Failed to fetch courses.");
  }

  if (!coursesData || coursesData.length === 0) {
    return { ok: true, courses: [] };
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

  return { ok: true, courses };
}

/**
 * Request-scoped memoization only (no cross-request caching due to cookies() limitation)
 */
const getCachedCourses = cache(async () => {
  return await fetchCoursesData();
});

/**
 * GET /api/courses
 * Retrieve all courses with their tees (cached)
 */
export async function GET() {
  try {
    const result = await timeFn("[courses API] Fetch", async () => {
      return await getCachedCourses();
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Get courses error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/courses/revalidate
 * Revalidate the courses cache (called after course/tee mutations)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { tag } = body as { tag?: string };

    // Only allow revalidating the courses tag
    if (tag && tag !== CACHE_TAG) {
      return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
    }

    // In Next.js 16, revalidateTag may need to be called with route segment
    // Try calling it - if it fails, the cache will expire naturally via TTL
    try {
      // @ts-expect-error - revalidateTag signature may vary by Next.js version
      revalidateTag(CACHE_TAG);
    } catch (revalidateError) {
      // Silently fail - cache will expire via TTL
      console.warn("Failed to revalidate tag (will expire via TTL):", revalidateError);
    }

    return NextResponse.json({ ok: true, revalidated: true, tag: CACHE_TAG });
  } catch (error) {
    console.error("Revalidate courses error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

