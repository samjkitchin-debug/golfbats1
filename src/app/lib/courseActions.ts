import { getClubSlug, isSupabaseConfigured } from "./supabaseClient";
import { createSupabaseBrowserClient } from "./supabaseBrowser";
import { perfMark, perfMeasure, perfLog } from "./perf";

export type Tee = {
  id: string;
  label: string;
  meters: number;
  par: number;
  slope: number;
};

export type Course = {
  id: string;
  name: string;
  location: string;
  website?: string | null;
  tees: Tee[];
};

// Lightweight types for course lookup (used in setup flows)
export type TeeLookup = {
  id: string;
  label: string;
};

export type CourseLookup = {
  id: string;
  name: string;
  location: string;
  tees: TeeLookup[];
};

// GameDay course pack types (heavy data for scoring)
export type HolePack = {
  holeNumber: number;
  par: number | null;
  meters: number | null;
  strokeIndex: number | null;
};

export type TeePack = {
  id: string;
  label: string;
  meters: number;
  par: number;
  slope: number;
  rating: number | null;
};

export type CoursePack = {
  course: {
    id: string;
    name: string;
    location: string;
  };
  tee: TeePack;
  holes: HolePack[];
};

const LS_KEY = "golfbats:courses:v1";

function getSupabase() {
  return createSupabaseBrowserClient();
}

/**
 * Revalidate the courses cache after mutations
 */
async function revalidateCoursesCache() {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/courses/revalidate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tag: "courses" }),
    });
  } catch (error) {
    // Silently fail - cache will expire naturally
    perfLog("revalidateCoursesCache: error", { error: error instanceof Error ? error.message : String(error) });
  }
}

function cleanNullableString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/**
 * Load courses from database API
 * No longer uses localStorage - always fetches from server
 */
export async function loadCourses(): Promise<Course[]> {
  if (typeof window === "undefined") return [];
  
  const start = perfMark("loadCourses");
  try {
    const res = await fetch("/api/courses");
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      perfMeasure("loadCourses", start);
      perfLog("loadCourses: API error", { status: res.status, error: json?.error });
      return [];
    }

    const courses = json.courses || [];
    const duration = perfMeasure("loadCourses", start);
    perfLog("loadCourses: success", {
      durationMs: duration.toFixed(2),
      count: courses.length,
    });
    
    return courses;
  } catch (error) {
    perfMeasure("loadCourses", start);
    perfLog("loadCourses: exception", { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

/**
 * @deprecated Courses are now loaded from database. This function does nothing.
 */
export function saveCourses(courses: Course[]) {
  // No-op: courses are stored in database, not localStorage
}

/**
 * @deprecated Use loadCourses() instead - it now always fetches from database
 */
export async function refreshCoursesFromDb(): Promise<Course[]> {
  return loadCourses();
}

/**
 * Load lightweight course lookup data for setup flows (e.g., Host Round)
 * Returns courses with minimal tee information (id, label only)
 */
export async function loadCourseLookup(): Promise<CourseLookup[]> {
  if (typeof window === "undefined") return [];
  
  try {
    const res = await fetch("/api/courses/lookup");
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("loadCourseLookup: API error", { status: res.status, error: json?.error });
      return [];
    }

    return json.courses || [];
  } catch (error) {
    console.error("loadCourseLookup: exception", { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

/**
 * Load course pack (heavy data: course + tee + holes) for GameDay scoring
 * Returns coursePack or null if not found/missing tee
 */
export async function loadCoursePack(roundId: string): Promise<CoursePack | null> {
  if (typeof window === "undefined") return null;
  
  try {
    const res = await fetch(`/api/gameday/${roundId}/course-pack`, { credentials: "include" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("loadCoursePack: API error", { status: res.status, error: json?.error });
      return null;
    }

    if (json.ok && json.coursePack) {
      return json.coursePack;
    }

    return null;
  } catch (error) {
    console.error("loadCoursePack: exception", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function getClubId(supabase: ReturnType<typeof getSupabase>): Promise<string | null> {
  const clubSlug = getClubSlug();
  const { data, error } = await supabase.from("clubs").select("id").eq("slug", clubSlug).single();
  if (error || !data) {
    // If clubs table doesn't exist or club not found, return null
    // This means the database might use 'club' (string) instead of 'club_id' (uuid)
    return null;
  }
  return data.id;
}

export async function createCourse(input: {
  name: string;
  location: string;
  website?: string | null;
  tees?: Tee[];
}) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");

  const supabase = getSupabase();
  const clubSlug = getClubSlug();
  const courseId = crypto.randomUUID();

  // Try to get club_id first
  const clubId = await getClubId(supabase);

  // Insert course into courses table (no tees field - tees go in separate table)
  // Use club_id if available (per schema), otherwise use club (string) for backward compatibility
  const insertData: any = {
    id: courseId,
    name: input.name.trim(),
    location: input.location.trim() || null,
    website: cleanNullableString(input.website),
  };

  if (!clubId) {
    throw new Error(`Club not found for slug: ${clubSlug}. Please ensure the clubs table has a row with this slug.`);
  }

  insertData.club_id = clubId;

  const { error: courseError } = await supabase.from("courses").insert(insertData);

  if (courseError) {
    throw new Error(`Failed to create course: ${courseError.message || JSON.stringify(courseError)}`);
  }

  // Invalidate cache
  await revalidateCoursesCache();

  // Return course object (tees will be loaded separately)
  const course: Course = {
    id: courseId,
    name: input.name.trim(),
    location: input.location.trim(),
    website: cleanNullableString(input.website),
    tees: [],
  };

  return course;
}

export async function updateCourse(courseId: string, patch: Partial<Omit<Course, "id">>) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");

  const supabase = getSupabase();

  // Update course by ID only (more reliable than using club filter)
  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (patch.name !== undefined) {
    updateData.name = patch.name.trim();
  }
  if (patch.location !== undefined) {
    updateData.location = patch.location.trim();
  }
  if (patch.website !== undefined) {
    updateData.website = cleanNullableString(patch.website);
  }

  const { error } = await supabase
    .from("courses")
    .update(updateData)
    .eq("id", courseId);

  if (error) {
    throw new Error(`Failed to update course: ${error.message || JSON.stringify(error)}`);
  }

  // Invalidate cache
  await revalidateCoursesCache();

  // Return updated course (will be reloaded from DB by caller)
  const courses = await loadCourses();
  const updated = courses.find((c) => c.id === courseId);
  if (!updated) {
    throw new Error("Course not found after update");
  }
  return updated;
}

export async function deleteCourse(courseId: string) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");

  const supabase = getSupabase();

  // First delete all tees for this course
  const { error: teesError } = await supabase
    .from("tees")
    .delete()
    .eq("course_id", courseId);

  if (teesError) {
    perfLog("deleteCourse: failed to delete tees", { courseId, error: teesError.message });
    // Continue anyway to delete the course
  }

  // Then delete the course (by ID only, more reliable)
  const { error } = await supabase
    .from("courses")
    .delete()
    .eq("id", courseId);

  if (error) {
    throw new Error(`Failed to delete course: ${error.message || JSON.stringify(error)}`);
  }

  // Invalidate cache
  await revalidateCoursesCache();

  // Course deleted from database - no need to update localStorage
}

export async function addTee(courseId: string, teeInput: Omit<Tee, "id">) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");

  const courses = await loadCourses();
  const idx = courses.findIndex((c) => c.id === courseId);
  if (idx === -1) throw new Error("Course not found");

  const supabase = getSupabase();
  const teeId = crypto.randomUUID();

  // Insert tee into tees table
  const { error: teeError } = await supabase.from("tees").insert({
    id: teeId,
    course_id: courseId,
    label: teeInput.label.trim(),
    meters: Number(teeInput.meters),
    par: Number(teeInput.par),
    slope: Number(teeInput.slope),
  });

  if (teeError) throw teeError;

  // Invalidate cache
  await revalidateCoursesCache();

  const tee: Tee = {
    id: teeId,
    label: teeInput.label.trim(),
    meters: Number(teeInput.meters),
    par: Number(teeInput.par),
    slope: Number(teeInput.slope),
  };

  // Tee saved to database - no need to update localStorage
  return tee;
}

export async function updateTee(courseId: string, teeId: string, patch: Partial<Omit<Tee, "id">>) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");

  const supabase = getSupabase();

  // Update tee in the tees table (not in courses table)
  const updateData: any = {
    updated_at: new Date().toISOString(),
  };
  
  if (patch.label !== undefined) updateData.label = patch.label.trim();
  if (patch.meters !== undefined) updateData.meters = Number(patch.meters);
  if (patch.par !== undefined) updateData.par = Number(patch.par);
  if (patch.slope !== undefined) updateData.slope = Number(patch.slope);

  const { error } = await supabase
    .from("tees")
    .update(updateData)
    .eq("id", teeId)
    .eq("course_id", courseId);

  if (error) {
    throw new Error(`Failed to update tee: ${error.message || JSON.stringify(error)}`);
  }

  // Invalidate cache
  await revalidateCoursesCache();

  // Return updated tee (will be reloaded from DB by caller)
  const courses = await loadCourses();
  const course = courses.find((c) => c.id === courseId);
  if (!course) {
    throw new Error("Course not found");
  }
  const updatedTee = course.tees.find((t) => t.id === teeId);
  if (!updatedTee) {
    throw new Error("Tee not found after update");
  }
  return updatedTee;
}

export async function deleteTee(courseId: string, teeId: string) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");

  const supabase = getSupabase();

  // Delete tee from the tees table (not from courses table)
  const { error } = await supabase
    .from("tees")
    .delete()
    .eq("id", teeId)
    .eq("course_id", courseId);

  if (error) {
    throw new Error(`Failed to delete tee: ${error.message || JSON.stringify(error)}`);
  }

  // Invalidate cache
  await revalidateCoursesCache();

  // Tee deleted from database - no need to update localStorage
}
