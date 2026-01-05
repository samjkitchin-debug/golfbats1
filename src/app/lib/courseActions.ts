import { getClubSlug, isSupabaseConfigured } from "./supabaseClient";
import { createSupabaseBrowserClient } from "./supabaseBrowser";

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

const LS_KEY = "golfbats:courses:v1";

function getSupabase() {
  return createSupabaseBrowserClient();
}

function cleanNullableString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export function loadCourses(): Course[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Course[]) : [];
  } catch {
    return [];
  }
}

export function saveCourses(courses: Course[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(courses));
}

/**
 * DB -> localStorage sync (optional helper used by pages)
 */
export async function refreshCoursesFromDb(): Promise<Course[]> {
  if (!isSupabaseConfigured()) return loadCourses();

  const supabase = getSupabase();
  const clubSlug = getClubSlug();
  const clubId = await getClubId(supabase);

  // Fetch courses
  let query = supabase.from("courses").select("id,name,location,website");
  
  if (clubId) {
    query = query.eq("club_id", clubId);
  } else {
    query = query.eq("club", clubSlug);
  }

  const { data: coursesData, error: coursesError } = await query.order("name", { ascending: true });

  if (coursesError || !coursesData) {
    return loadCourses();
  }

  // Fetch all tees for these courses
  const courseIds = coursesData.map((c) => c.id);
  const { data: teesData, error: teesError } = await supabase
    .from("tees")
    .select("id,course_id,label,meters,par,slope")
    .in("course_id", courseIds);

  if (teesError) {
    // If tees fetch fails, continue with empty tees arrays
    console.warn("Failed to fetch tees:", teesError);
  }

  // Combine courses with their tees
  const courses: Course[] = coursesData.map((course) => {
    const tees = (teesData ?? [])
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

  saveCourses(courses);
  return courses;
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

  if (clubId) {
    insertData.club_id = clubId;
  } else {
    insertData.club = clubSlug;
  }

  const { error: courseError } = await supabase.from("courses").insert(insertData);

  if (courseError) {
    throw new Error(`Failed to create course: ${courseError.message || JSON.stringify(courseError)}`);
  }

  // Create course object for localStorage (with empty tees array for now)
  const course: Course = {
    id: courseId,
    name: input.name.trim(),
    location: input.location.trim(),
    website: cleanNullableString(input.website),
    tees: [],
  };

  const courses = loadCourses();
  saveCourses([...courses, course]);
  return course;
}

export async function updateCourse(courseId: string, patch: Partial<Omit<Course, "id">>) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");

  const courses = loadCourses();
  const idx = courses.findIndex((c) => c.id === courseId);
  if (idx === -1) throw new Error("Course not found");

  const current = courses[idx];

  const updated: Course = {
    ...current,
    ...patch,
    id: current.id,
    name: (patch.name ?? current.name).trim(),
    location: (patch.location ?? current.location).trim(),
    website:
      patch.website !== undefined ? cleanNullableString(patch.website) : cleanNullableString(current.website),
    tees: patch.tees ?? current.tees,
  };

  const supabase = getSupabase();

  // Update course by ID only (more reliable than using club filter)
  const { error } = await supabase
    .from("courses")
    .update({
      name: updated.name,
      location: updated.location,
      website: updated.website,
      updated_at: new Date().toISOString(),
    })
    .eq("id", courseId);

  if (error) {
    throw new Error(`Failed to update course: ${error.message || JSON.stringify(error)}`);
  }

  const next = [...courses];
  next[idx] = updated;
  saveCourses(next);
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
    console.warn("Failed to delete tees:", teesError);
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

  const courses = loadCourses().filter((c) => c.id !== courseId);
  saveCourses(courses);
}

export async function addTee(courseId: string, teeInput: Omit<Tee, "id">) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");

  const courses = loadCourses();
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

  const tee: Tee = {
    id: teeId,
    label: teeInput.label.trim(),
    meters: Number(teeInput.meters),
    par: Number(teeInput.par),
    slope: Number(teeInput.slope),
  };

  const updatedCourse: Course = { ...courses[idx], tees: [...courses[idx].tees, tee] };

  const next = [...courses];
  next[idx] = updatedCourse;
  saveCourses(next);

  return tee;
}

export async function updateTee(courseId: string, teeId: string, patch: Partial<Omit<Tee, "id">>) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");

  const courses = loadCourses();
  const idx = courses.findIndex((c) => c.id === courseId);
  if (idx === -1) throw new Error("Course not found");

  const course = courses[idx];
  const teeIdx = course.tees.findIndex((t) => t.id === teeId);
  if (teeIdx === -1) throw new Error("Tee not found");

  const existing = course.tees[teeIdx];
  const updatedTee: Tee = {
    ...existing,
    ...patch,
    label: (patch.label ?? existing.label).trim(),
    meters: patch.meters ?? existing.meters,
    par: patch.par ?? existing.par,
    slope: patch.slope ?? existing.slope,
  };

  const supabase = getSupabase();

  // Update tee in the tees table (not in courses table)
  const updateData: any = {};
  if (patch.label !== undefined) updateData.label = updatedTee.label;
  if (patch.meters !== undefined) updateData.meters = updatedTee.meters;
  if (patch.par !== undefined) updateData.par = updatedTee.par;
  if (patch.slope !== undefined) updateData.slope = updatedTee.slope;
  updateData.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("tees")
    .update(updateData)
    .eq("id", teeId)
    .eq("course_id", courseId);

  if (error) {
    throw new Error(`Failed to update tee: ${error.message || JSON.stringify(error)}`);
  }

  // Update localStorage
  const nextTees = [...course.tees];
  nextTees[teeIdx] = updatedTee;

  const updatedCourse: Course = {
    ...course,
    tees: nextTees,
  };

  const nextCourses = [...courses];
  nextCourses[idx] = updatedCourse;
  saveCourses(nextCourses);

  return updatedTee;
}

export async function deleteTee(courseId: string, teeId: string) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");

  const courses = loadCourses();
  const idx = courses.findIndex((c) => c.id === courseId);
  if (idx === -1) throw new Error("Course not found");

  const course = courses[idx];

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

  // Update localStorage
  const updatedCourse: Course = {
    ...course,
    tees: course.tees.filter((t) => t.id !== teeId),
  };

  const next = [...courses];
  next[idx] = updatedCourse;
  saveCourses(next);
}
