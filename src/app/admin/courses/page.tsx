"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addTee,
  createCourse,
  deleteCourse,
  deleteTee,
  loadCourses,
  refreshCoursesFromDb,
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
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newWebsite, setNewWebsite] = useState("");

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

  async function refresh() {
    try {
      const synced = await loadCourses();
      setCourses(synced);
    } catch (error) {
      console.warn("Failed to refresh courses:", error);
    }
  }

  // Load courses from database on mount
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const synced = await loadCourses();
        setCourses(synced);
      } catch (error) {
        console.warn("Failed to load courses:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
      <div className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="text-xl font-semibold text-foreground">Courses</div>
        <div className="mt-1 text-sm text-muted">
          Admin-only. Add courses and tees used when creating trips.
        </div>
      </div>

      {/* Search Input */}
      <section className="rounded-xl border bg-surface p-4 shadow-sm">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search courses by name, location, or tee..."
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-border"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="mt-2 text-xs text-muted hover:text-foreground underline"
          >
            Clear search
          </button>
        )}
      </section>

      {/* Add Course */}
      <section className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="text-sm font-medium text-foreground">Add course</div>

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
            className="mt-1 rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-95"
          >
            Add course
          </button>

          <div className="text-xs text-muted">
            Tip: keep tee labels simple (e.g. Blue / White / Red).
          </div>
        </div>
      </section>

      {/* List Courses */}
      {loading ? (
        <div className="rounded-xl border bg-surface p-5 text-sm text-muted shadow-sm">
          Loading courses...
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border bg-surface p-5 text-sm text-muted shadow-sm">
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
  const [isEditing, setIsEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState(course.name);
  const [location, setLocation] = useState(course.location ?? "");
  const [website, setWebsite] = useState(course.website ?? "");

  // Track edited existing tees
  const [editedTees, setEditedTees] = useState<Record<string, Partial<Tee>>>({});
  
  // Track deleted tees (only delete on save)
  const [deletedTeeIds, setDeletedTeeIds] = useState<Set<string>>(new Set());
  
  // Track new tees (temporary IDs)
  type NewTee = { tempId: string; label: string; meters: number; par: number; slope: number };
  const [newTees, setNewTees] = useState<NewTee[]>([]);

  const [teeLabel, setTeeLabel] = useState("");
  const [teeMeters, setTeeMeters] = useState("");
  const [teePar, setTeePar] = useState("");
  const [teeSlope, setTeeSlope] = useState("");

  // Reset state when course changes or editing mode changes
  useEffect(() => {
    if (!isEditing) {
      setName(course.name);
      setLocation(course.location ?? "");
      setWebsite(course.website ?? "");
      setEditedTees({});
      setDeletedTeeIds(new Set());
      setNewTees([]);
      setTeeLabel("");
      setTeeMeters("");
      setTeePar("");
      setTeeSlope("");
      setSaved(false);
    }
  }, [course, isEditing]);

  const teesSorted = useMemo(() => {
    return [...(course.tees || [])].sort((a, b) => a.label.localeCompare(b.label));
  }, [course.tees]);

  async function handleSaveChanges() {
    try {
      // Save course details
      await updateCourse(course.id, {
        name,
        location,
        website,
      });

      // Delete tees marked for deletion
      for (const teeId of deletedTeeIds) {
        await deleteTee(course.id, teeId);
      }

      // Save edited existing tees (only if not deleted)
      for (const [teeId, patch] of Object.entries(editedTees)) {
        if (!deletedTeeIds.has(teeId) && Object.keys(patch).length > 0) {
          await updateTee(course.id, teeId, patch);
        }
      }

      // Save new tees
      for (const newTee of newTees) {
        await addTee(course.id, {
          label: newTee.label,
          meters: newTee.meters,
          par: newTee.par,
          slope: newTee.slope,
        });
      }

      setSaved(true);
      setTimeout(() => {
        setIsEditing(false);
        onChanged();
      }, 1000);
    } catch (error) {
      console.error("Failed to save changes:", error);
      alert(`Failed to save changes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function addNewTeeLine() {
    const label = teeLabel.trim();
    if (!label) return;

    setNewTees([
      ...newTees,
      {
        tempId: crypto.randomUUID(),
        label,
        meters: num(teeMeters, 0),
        par: num(teePar, 72),
        slope: num(teeSlope, 113),
      },
    ]);

    setTeeLabel("");
    setTeeMeters("");
    setTeePar("");
    setTeeSlope("");
  }

  function removeNewTee(tempId: string) {
    setNewTees(newTees.filter((t) => t.tempId !== tempId));
  }

  function updateNewTee(tempId: string, patch: Partial<NewTee>) {
    setNewTees(newTees.map((t) => (t.tempId === tempId ? { ...t, ...patch } : t)));
  }

  function removeTee(teeId: string) {
    const ok = window.confirm("Delete this tee?");
    if (!ok) return;
    // Mark for deletion (will be deleted on save)
    setDeletedTeeIds(new Set([...deletedTeeIds, teeId]));
    // Remove from edited tees if present
    const { [teeId]: _, ...rest } = editedTees;
    setEditedTees(rest);
  }

  function updateEditedTee(teeId: string, patch: Partial<Tee>) {
    setEditedTees((prev) => ({
      ...prev,
      [teeId]: { ...prev[teeId], ...patch },
    }));
  }

  return (
    <section className="rounded-xl border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-foreground">{course.name}</div>
          {course.location ? <div className="mt-1 text-sm text-muted">{course.location}</div> : null}
        </div>

        <div className="flex gap-2">
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="rounded-md border bg-surface px-3 py-2 text-sm text-foreground hover:bg-background"
            >
              Edit
            </button>
          )}
          <button
            onClick={() => onDelete(course.id)}
            className="rounded-md border bg-surface px-3 py-2 text-sm text-foreground hover:bg-background"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Edit course fields - only shown when editing */}
      {isEditing && (
        <>
          <div className="mt-4 grid gap-2">
            <div className="text-sm font-medium text-foreground">Edit Course</div>

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
          </div>

          {/* Tees */}
          <div className="mt-5">
            <div className="text-sm font-medium text-foreground">Tee sets</div>

            {teesSorted.filter((tee) => !deletedTeeIds.has(tee.id)).length === 0 && newTees.length === 0 ? (
              <div className="mt-2 text-sm text-muted">No tees yet.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {teesSorted
                  .filter((tee) => !deletedTeeIds.has(tee.id))
                  .map((tee) => {
                    const edited = editedTees[tee.id] || {};
                    return (
                      <div key={tee.id} className="rounded-md border p-3">
                        <div className="grid gap-2 md:grid-cols-5">
                          <input
                            value={edited.label ?? tee.label}
                            onChange={(e) => updateEditedTee(tee.id, { label: e.target.value })}
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            placeholder="Label"
                          />
                          <input
                            value={edited.meters ?? String(tee.meters)}
                            onChange={(e) => updateEditedTee(tee.id, { meters: num(e.target.value, tee.meters) })}
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            placeholder="Meters"
                            inputMode="numeric"
                          />
                          <input
                            value={edited.par ?? String(tee.par)}
                            onChange={(e) => updateEditedTee(tee.id, { par: num(e.target.value, tee.par) })}
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            placeholder="Par"
                            inputMode="numeric"
                          />
                          <input
                            value={edited.slope ?? String(tee.slope)}
                            onChange={(e) => updateEditedTee(tee.id, { slope: num(e.target.value, tee.slope) })}
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            placeholder="Slope"
                            inputMode="numeric"
                          />

                          <button
                            onClick={() => removeTee(tee.id)}
                            className="rounded-md border bg-surface px-3 py-2 text-sm text-foreground hover:bg-background"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}

                {/* New tees (not yet saved) */}
                {newTees.map((newTee) => (
                  <div key={newTee.tempId} className="rounded-md border p-3">
                    <div className="grid gap-2 md:grid-cols-5">
                      <input
                        value={newTee.label}
                        onChange={(e) => updateNewTee(newTee.tempId, { label: e.target.value })}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        placeholder="Label"
                      />
                      <input
                        value={String(newTee.meters)}
                        onChange={(e) => updateNewTee(newTee.tempId, { meters: num(e.target.value, newTee.meters) })}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        placeholder="Meters"
                        inputMode="numeric"
                      />
                      <input
                        value={String(newTee.par)}
                        onChange={(e) => updateNewTee(newTee.tempId, { par: num(e.target.value, newTee.par) })}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        placeholder="Par"
                        inputMode="numeric"
                      />
                      <input
                        value={String(newTee.slope)}
                        onChange={(e) => updateNewTee(newTee.tempId, { slope: num(e.target.value, newTee.slope) })}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        placeholder="Slope"
                        inputMode="numeric"
                      />

                      <button
                        onClick={() => removeNewTee(newTee.tempId)}
                        className="rounded-md border bg-surface px-3 py-2 text-sm text-foreground hover:bg-background"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-lg border bg-surface p-4">
              <div className="text-sm font-medium text-foreground">Add Tee</div>

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
                onClick={addNewTeeLine}
                className="mt-3 rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-95"
              >
                Add Tee
              </button>

              <div className="mt-2 text-xs text-muted">
                For now: meters / par / slope. We can add course rating later if you want.
              </div>
            </div>
          </div>

          {/* Save changes button */}
          <div className="mt-5 flex gap-2">
            <button
              onClick={handleSaveChanges}
              className="rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              {saved ? "Changes Saved" : "Save Changes"}
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="rounded-md border bg-surface px-4 py-2 text-sm text-foreground hover:bg-background"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}


