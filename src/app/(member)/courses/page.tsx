"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadCourses, type Course } from "../../lib/courseActions";

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    document.title = "GolfBats - Courses";
  }, []);

  useEffect(() => {
    async function loadCoursesData() {
      try {
        const coursesData = await loadCourses();
        setCourses(coursesData);
      } catch (error) {
        console.warn("Failed to load courses:", error);
      }
    }
    loadCoursesData();
  }, []);

  const sorted = useMemo(() => {
    return [...courses].sort((a, b) => a.name.localeCompare(b.name));
  }, [courses]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-gray-900">Courses</div>
          <div className="text-sm text-gray-600">Browse course + tees</div>
        </div>

        <Link
          href="/admin/courses"
          className="rounded-md border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Edit (admin)
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-600">No courses yet.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((c) => (
            <div key={c.id} className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="text-lg font-semibold text-gray-900">{c.name}</div>
              <div className="mt-1 text-sm text-gray-600">{c.location}</div>

              {c.website ? (
                <div className="mt-2 text-sm">
                  <a
                    className="text-gray-700 underline"
                    href={c.website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Website
                  </a>
                </div>
              ) : null}

              <div className="mt-4 text-sm font-medium text-gray-600">Tees</div>

              {c.tees?.length ? (
                <div className="mt-2 space-y-2">
                  {c.tees.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-gray-900">{t.label}</span>
                      <span className="text-gray-700">
                        {t.meters}m · Par {t.par} · Slope {t.slope}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-sm text-gray-600">No tees added yet.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
