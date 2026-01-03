export type Tee = {
  id: string;
  label: string; // Blue / White / etc
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
  return safeParse<Course[]>(
    window.localStorage.getItem(COURSES_STORAGE_KEY),
    []
  );
}

export function saveCourses(courses: Course[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(COURSES_STORAGE_KEY, JSON.stringify(courses));
  } catch {}
}

/* ================================
   Queries
================================ */
export function getCourseById(courseId: string | null | undefined): Course | undefined {
  if (!courseId) return undefined;
  return loadCourses().find((c) => c.id === courseId);
}

/* ================================
   Mutations: Courses
================================ */
export function createCourse(input: {
  name: string;
  location: string;
  website?: string;
}): Course {
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
  return course;
}

export function updateCourse(
  courseId: string,
  patch: Partial<Pick<Course, "name" | "location" | "website">>
): Course {
  const courses = loadCourses();
  const idx = courses.findIndex((c) => c.id === courseId);
  if (idx === -1) throw new Error("Course not found");

  const current = courses[idx];

  const next: Course = {
    ...current,
    name: patch.name !== undefined ? patch.name.trim() : current.name,
    location:
      patch.location !== undefined ? patch.location.trim() : current.location,
    website:
      patch.website !== undefined
        ? patch.website.trim() || undefined
        : current.website,
  };

  const updated = courses.slice();
  updated[idx] = next;
  saveCourses(updated);
  return next;
}

export function deleteCourse(courseId: string) {
  const updated = loadCourses().filter((c) => c.id !== courseId);
  saveCourses(updated);
}

/* ================================
   Mutations: Tees
================================ */
export function addTee(
  courseId: string,
  input: { label: string; meters: number; par: number; slope: number }
): Tee {
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

  const updatedCourse: Course = {
    ...courses[idx],
    tees: [...courses[idx].tees, tee],
  };

  const updated = courses.slice();
  updated[idx] = updatedCourse;
  saveCourses(updated);

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

  return nextTee;
}

export function deleteTee(courseId: string, teeId: string) {
  const courses = loadCourses();
  const idx = courses.findIndex((c) => c.id === courseId);
  if (idx === -1) throw new Error("Course not found");

  const updatedCourse: Course = {
    ...courses[idx],
    tees: courses[idx].tees.filter((t) => t.id !== teeId),
  };

  const updated = courses.slice();
  updated[idx] = updatedCourse;
  saveCourses(updated);
  
}
