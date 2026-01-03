import { getClubSlug, isSupabaseConfigured, supabase } from "./supabaseClient";

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
  website?: string;
  tees: Tee[];
};

const COURSES_STORAGE_KEY = "golfbats.courses.v1";

/* ================================
   Storage helpers (SSR-safe)
================================ */
function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadCourses(): Course[] {
  if (!canUseStorage()) return [];
  // Fire-and-forget DB sync (keeps UI sync)
  void ensureCoursesSyncedFromDb();
  return safeParse<Course[]>(window.localStorage.getItem(COURSES_STORAGE_KEY), []);
}

export function saveCourses(courses: Course[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(COURSES_STORAGE_KEY, JSON.stringify(courses));
  } catch {}
}

/* ================================
   Supabase bridge
================================ */
let clubIdCache: string | null = null;
let clubIdPromise: Promise<string | null> | null = null;

async function getClubId(): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  if (clubIdCache) return clubIdCache;
  if (clubIdPromise) return clubIdPromise;

  clubIdPromise = (async () => {
    const slug = getClubSlug();
    const { data, error } = await supabase.from("clubs").select("id").eq("slug", slug).maybeSingle();
    if (error || !data?.id) return null;
    clubIdCache = data.id;
    return clubIdCache;
  })();

  return clubIdPromise;
}

let coursesSyncInFlight: Promise<void> | null = null;

export async function ensureCoursesSyncedFromDb(): Promise<void> {
  if (!canUseStorage()) return;
  if (!isSupabaseConfigured() || !supabase) return;
  if (coursesSyncInFlight) return coursesSyncInFlight;

  coursesSyncInFlight = (async () => {
    const clubId = await getClubId();
    if (!clubId) return;

    const { data: courses, error: courseErr } = await supabase
      .from("courses")
      .select("id,name,location,website")
      .eq("club_id", clubId)
      .order("name", { ascending: true });

    if (courseErr || !courses) return;

    const courseIds = courses.map((c) => c.id);
    const { data: tees, error: teeErr } = await supabase
      .from("tees")
      .select("id,course_id,label,meters,par,slope")
      .in("course_id", courseIds.length ? courseIds : ["00000000-0000-0000-0000-000000000000"]);

    if (teeErr) return;

    const byCourse: Record<string, Tee[]> = {};
    for (const t of tees ?? []) {
      const tee: Tee = { id: t.id, label: t.label, meters: t.meters, par: t.par, slope: t.slope };
      (byCourse[t.course_id] ||= []).push(tee);
    }

    const merged: Course[] = courses.map((c) => ({
      id: c.id,
      name: c.name,
      location: c.location ?? "",
      website: c.website ?? undefined,
      tees: (byCourse[c.id] || []).slice().sort((a, b) => a.label.localeCompare(b.label)),
    }));

    saveCourses(merged);
  })().finally(() => {
    coursesSyncInFlight = null;
  });

  return coursesSyncInFlight;
}

/* ================================
   Queries
================================ */
export function getCourseById(courseId: string | null | undefined): Course | undefined {
  if (!courseId) return undefined;
  return loadCourses().find((c) => c.id === courseId);
}

/* ================================
   Mutations: Courses (local-first, DB mirror)
================================ */
export function createCourse(input: { name: string; location: string; website?: string }): Course {
  const courses = loadCourses();

  const course: Course = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    location: input.location.trim(),
    website: input.website?.trim() || undefined,
    tees: [],
  };

  const updated = [...courses, course];
  saveCourses(updated);

  void mirrorCourseUpsert(course);
  return course;
}

export function updateCourse(courseId: string, patch: Partial<Pick<Course, "name" | "location" | "website">>): Course {
  const courses = loadCourses();
  const idx = courses.findIndex((c) => c.id === courseId);
  if (idx === -1) throw new Error("Course not found");

  const current = courses[idx];

  const next: Course = {
    ...current,
    name: patch.name !== undefined ? patch.name.trim() : current.name,
    location: patch.location !== undefined ? patch.location.trim() : current.location,
    website: patch.website !== undefined ? patch.website.trim() || undefined : current.website,
  };

  const updated = courses.slice();
  updated[idx] = next;
  saveCourses(updated);

  void mirrorCourseUpsert(next);
  return next;
}

export function deleteCourse(courseId: string) {
  const updated = loadCourses().filter((c) => c.id !== courseId);
  saveCourses(updated);
  void mirrorCourseDelete(courseId);
}

/* ================================
   Mutations: Tees (local-first, DB mirror)
================================ */
export function addTee(courseId: string, input: { label: string; meters: number; par: number; slope: number }): Tee {
  const courses = loadCourses();
  const idx = courses.findIndex((c) => c.id === courseId);
  if (idx === -1) throw new Error("Course not found");

  const tee: Tee = {
    id: crypto.randomUUID(),
    label: input.label.trim(),
    meters: Number(input.meters),
    par: Number(input.par),
    slope: Number(input.slope),
  };

  const updatedCourse: Course = { ...courses[idx], tees: [...courses[idx].tees, tee] };
  const updated = courses.slice();
  updated[idx] = updatedCourse;
  saveCourses(updated);

  void mirrorTeeUpsert(courseId, tee);
  return tee;
}

export function updateTee(
  courseId: string,
  teeId: string,
  patch: Partial<Pick<Tee, "label" | "meters" | "par" | "slope">>
): Tee {
  const courses = loadCourses();
  const idx = courses.findIndex((c) => c.id === courseId);
  if (idx === -1) throw new Error("Course not found");

  const course = courses[idx];
  const existing = course.tees.find((t) => t.id === teeId);
  if (!existing) throw new Error("Tee not found");

  const nextTee: Tee = {
    ...existing,
    label: patch.label !== undefined ? patch.label.trim() : existing.label,
    meters: patch.meters !== undefined ? Number(patch.meters) : existing.meters,
    par: patch.par !== undefined ? Number(patch.par) : existing.par,
    slope: patch.slope !== undefined ? Number(patch.slope) : existing.slope,
  };

  const updatedCourse: Course = {
    ...course,
    tees: course.tees.map((t) => (t.id === teeId ? nextTee : t)),
  };

  const updated = courses.slice();
  updated[idx] = updatedCourse;
  saveCourses(updated);

  void mirrorTeeUpsert(courseId, nextTee);
  return nextTee;
}

export function deleteTee(courseId: string, teeId: string) {
  const courses = loadCourses();
  const idx = courses.findIndex((c) => c.id === courseId);
  if (idx === -1) throw new Error("Course not found");

  const updatedCourse: Course = { ...courses[idx], tees: courses[idx].tees.filter((t) => t.id !== teeId) };
  const updated = courses.slice();
  updated[idx] = updatedCourse;
  saveCourses(updated);

  void mirrorTeeDelete(teeId);
}

/* ================================
   DB mirror helpers
================================ */
async function mirrorCourseUpsert(course: Course) {
  if (!isSupabaseConfigured() || !supabase) return;
  const clubId = await getClubId();
  if (!clubId) return;

  await supabase.from("courses").upsert(
    {
      id: course.id,
      club_id: clubId,
      name: course.name,
      location: course.location,
      website: course.website ?? null,
    },
    { onConflict: "id" }
  );
}

async function mirrorCourseDelete(courseId: string) {
  if (!isSupabaseConfigured() || !supabase) return;
  await supabase.from("courses").delete().eq("id", courseId);
}

async function mirrorTeeUpsert(courseId: string, tee: Tee) {
  if (!isSupabaseConfigured() || !supabase) return;

  await supabase.from("tees").upsert(
    {
      id: tee.id,
      course_id: courseId,
      label: tee.label,
      meters: tee.meters,
      par: tee.par,
      slope: tee.slope,
    },
    { onConflict: "id" }
  );
}

async function mirrorTeeDelete(teeId: string) {
  if (!isSupabaseConfigured() || !supabase) return;
  await supabase.from("tees").delete().eq("id", teeId);
}
