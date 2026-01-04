"use client";

import { useMemo, useState } from "react";
import {
  addTee,
  createCourse,
  deleteCourse,
  deleteTee,
  loadCourses,
  updateCourse,
  updateTee,
  type Course,
  type Tee,
} from "../../lib/courseActions";

function num(v: string, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>(() => loadCourses());

  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newWebsite, setNewWebsite] = useState("");

  const sorted = useMemo(() => {
    return [...courses].sort((a, b) => a.name.localeCompare(b.name));
  }, [courses]);

  function refresh() {
    setCourses(loadCourses());
  }

  async function handleAddCourse() {
    const name = newName.trim();
    if (!name) return;

    try {
      await createCourse({
        name,
        location: newLocation.trim(),
        website: newWebsite.trim() || undefined,
      });

      setNewName("");
      setNewLocation("");
      setNewWebsite("");
      refresh();
    } catch (error) {
      console.error("Failed to create course:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to create course: ${errorMessage}`);
    }
  }

  function handleDeleteCourse(courseId: string) {
    const ok = window.confirm("Delete this course? This cannot be undone.");
    if (!ok) return;
    deleteCourse(courseId);
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-xl font-semibold text-brand-black">Courses</div>
        <div className="mt-1 text-sm text-gray-600">
          Admin-only. Add courses and tees used when creating trips.
        </div>
      </div>

      {/* Add Course */}
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-sm font-medium text-gray-700">Add course</div>

        <div className="mt-3 grid gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Course name"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <input
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            placeholder="Location (optional)"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <input
            value={newWebsite}
            onChange={(e) => setNewWebsite(e.target.value)}
            placeholder="Website (optional)"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />

          <button
            onClick={handleAddCourse}
            className="mt-1 rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white hover:opacity-95"
          >
            Add course
          </button>

          <div className="text-xs text-gray-500">
            Tip: keep tee labels simple (e.g. Blue / White / Red).
          </div>
        </div>
      </section>

      {/* List Courses */}
      {sorted.length === 0 ? (
        <div className="rounded-xl border bg-white p-5 text-sm text-gray-600 shadow-sm">
          No courses yet.
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((course) => (
            <CourseCard key={course.id} course={course} onChanged={refresh} onDelete={handleDeleteCourse} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({
  course,
  onChanged,
  onDelete,
}: {
  course: Course;
  onChanged: () => void;
  onDelete: (courseId: string) => void;
}) {
  const [name, setName] = useState(course.name);
  const [location, setLocation] = useState(course.location ?? "");
  const [website, setWebsite] = useState(course.website ?? "");

  const [teeLabel, setTeeLabel] = useState("");
  const [teeMeters, setTeeMeters] = useState("");
  const [teePar, setTeePar] = useState("");
  const [teeSlope, setTeeSlope] = useState("");

  const teesSorted = useMemo(() => {
    return [...(course.tees || [])].sort((a, b) => a.label.localeCompare(b.label));
  }, [course.tees]);

  function saveCourse() {
    updateCourse(course.id, {
      name,
      location,
      website,
    });
    onChanged();
  }

  function addNewTee() {
    const label = teeLabel.trim();
    if (!label) return;

    addTee(course.id, {
      label,
      meters: num(teeMeters, 0),
      par: num(teePar, 72),
      slope: num(teeSlope, 113),
    });

    setTeeLabel("");
    setTeeMeters("");
    setTeePar("");
    setTeeSlope("");

    onChanged();
  }

  function removeTee(teeId: string) {
    const ok = window.confirm("Delete this tee?");
    if (!ok) return;
    deleteTee(course.id, teeId);
    onChanged();
  }

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-brand-black">{course.name}</div>
          {course.location ? <div className="mt-1 text-sm text-gray-600">{course.location}</div> : null}
        </div>

        <button
          onClick={() => onDelete(course.id)}
          className="rounded-md border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Delete
        </button>
      </div>

      {/* Edit course fields */}
      <div className="mt-4 grid gap-2">
        <div className="text-sm font-medium text-gray-700">Edit course</div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Course name"
        />
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Location (optional)"
        />
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Website (optional)"
        />

        <div className="flex gap-2">
          <button
            onClick={saveCourse}
            className="rounded-md bg-brand-black px-4 py-2 text-sm font-medium text-white hover:opacity-95"
          >
            Save changes
          </button>
        </div>
      </div>

      {/* Tees */}
      <div className="mt-5">
        <div className="text-sm font-medium text-gray-700">Tee sets</div>

        {teesSorted.length === 0 ? (
          <div className="mt-2 text-sm text-gray-600">No tees yet.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {teesSorted.map((tee) => (
              <TeeRow key={tee.id} courseId={course.id} tee={tee} onChanged={onChanged} onDelete={removeTee} />
            ))}
          </div>
        )}

        <div className="mt-4 rounded-lg border bg-white p-4">
          <div className="text-sm font-medium text-gray-700">Add tee</div>

          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <input
              value={teeLabel}
              onChange={(e) => setTeeLabel(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Label (e.g. Blue)"
            />
            <input
              value={teeMeters}
              onChange={(e) => setTeeMeters(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Meters"
              inputMode="numeric"
            />
            <input
              value={teePar}
              onChange={(e) => setTeePar(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Par"
              inputMode="numeric"
            />
            <input
              value={teeSlope}
              onChange={(e) => setTeeSlope(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Slope"
              inputMode="numeric"
            />
          </div>

          <button
            onClick={addNewTee}
            className="mt-3 rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white hover:opacity-95"
          >
            Add tee
          </button>

          <div className="mt-2 text-xs text-gray-500">
            For now: meters / par / slope. We can add course rating later if you want.
          </div>
        </div>
      </div>
    </section>
  );
}

function TeeRow({
  courseId,
  tee,
  onChanged,
  onDelete,
}: {
  courseId: string;
  tee: Tee;
  onChanged: () => void;
  onDelete: (teeId: string) => void;
}) {
  const [label, setLabel] = useState(tee.label);
  const [meters, setMeters] = useState(String(tee.meters));
  const [par, setPar] = useState(String(tee.par));
  const [slope, setSlope] = useState(String(tee.slope));

  function save() {
    updateTee(courseId, tee.id, {
      label,
      meters: num(meters, tee.meters),
      par: num(par, tee.par),
      slope: num(slope, tee.slope),
    });
    onChanged();
  }

  return (
    <div className="rounded-md border p-3">
      <div className="grid gap-2 md:grid-cols-5">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Label"
        />
        <input
          value={meters}
          onChange={(e) => setMeters(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Meters"
          inputMode="numeric"
        />
        <input
          value={par}
          onChange={(e) => setPar(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Par"
          inputMode="numeric"
        />
        <input
          value={slope}
          onChange={(e) => setSlope(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Slope"
          inputMode="numeric"
        />

        <div className="flex gap-2">
          <button
            onClick={save}
            className="flex-1 rounded-md bg-brand-black px-3 py-2 text-sm font-medium text-white hover:opacity-95"
          >
            Save
          </button>
          <button
            onClick={() => onDelete(tee.id)}
            className="flex-1 rounded-md border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

