"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadCourses, type Course } from "../../lib/courseActions";

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");

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
    let filtered = [...courses];
    
    // Apply search filter if query exists
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      filtered = filtered.filter((c) => {
        const name = (c.name || "").toLowerCase();
        const location = (c.location || "").toLowerCase();
        const teeLabels = (c.tees || []).map(t => t.label.toLowerCase()).join(" ");
        
        return name.includes(query) ||
               location.includes(query) ||
               teeLabels.includes(query);
      });
    }
    
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [courses, searchQuery]);

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

      {/* Search Input */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search courses by name, location, or tee..."
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="mt-2 text-xs text-gray-600 hover:text-gray-900 underline"
          >
            Clear search
          </button>
        )}
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
