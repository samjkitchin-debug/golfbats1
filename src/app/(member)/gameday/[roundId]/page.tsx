"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { loadCourses, type Course } from "../../../lib/courseActions";
import Link from "next/link";

type GameDayData = {
  roundId: number;
  participants: Array<{ id: string; displayName: string }>;
  courseId: string | null;
  teeId: string | null;
  status: "not_started" | "in_progress" | "finished";
};

export default function GameDayPage() {
  const router = useRouter();
  const params = useParams<{ roundId: string }>();
  const roundId = params.roundId;

  const [gameDayData, setGameDayData] = useState<GameDayData | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [updatingCourse, setUpdatingCourse] = useState(false);
  const [managingParticipants, setManagingParticipants] = useState(false);

  useEffect(() => {
    document.title = "DayForeIt - GameDay";
  }, []);

  // Load GameDay data using dedicated API
  useEffect(() => {
    async function loadData() {
      try {
        const bootstrapRes = await fetch("/api/me/bootstrap", { credentials: "include" });
        if (!bootstrapRes.ok) {
          if (bootstrapRes.status === 401) {
            router.replace("/login");
            return;
          }
          throw new Error("Failed to load bootstrap data");
        }
        const bootstrap = await bootstrapRes.json();
        setActiveGroupId(bootstrap.activeGroupId);
        setCurrentMemberId(bootstrap.member?.id || null);

        if (!roundId) {
          setLoading(false);
          return;
        }

        // Load GameDay data and courses in parallel
        const [gameDayRes, coursesData] = await Promise.all([
          fetch(`/api/gameday/${roundId}`, { credentials: "include" }),
          loadCourses(),
        ]);

        if (!gameDayRes.ok) {
          if (gameDayRes.status === 404) {
            setGameDayData(null);
          } else {
            throw new Error("Failed to load GameDay data");
          }
        } else {
          const gameDay = await gameDayRes.json();
          if (gameDay.ok) {
            setGameDayData(gameDay);
          } else {
            setGameDayData(null);
          }
        }

        setCourses(coursesData);
      } catch (error) {
        console.error("Failed to load data:", error);
        setGameDayData(null);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [roundId, router]);

  async function handleCourseSelect(courseId: string) {
    if (!activeGroupId || !roundId || !courseId) return;

    setUpdatingCourse(true);
    try {
      // Update trip via API
      const updateRes = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: parseInt(roundId, 10),
          groupId: activeGroupId,
          trip: { courseId },
        }),
      });

      if (!updateRes.ok) {
        const error = await updateRes.json();
        throw new Error(error.error || "Failed to update course");
      }

      // Reload GameDay data
      const res = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setGameDayData(data);
        }
      }
    } catch (error) {
      console.error("Failed to update course:", error);
      alert(error instanceof Error ? error.message : "Failed to update course. Please try again.");
    } finally {
      setUpdatingCourse(false);
    }
  }

  async function handleAddParticipant(memberId: string) {
    if (!roundId) return;

    setManagingParticipants(true);
    try {
      const res = await fetch(`/api/gameday/${roundId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "add", memberId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to add participant");
      }

      // Reload GameDay data
      const gameDayRes = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (gameDayRes.ok) {
        const data = await gameDayRes.json();
        if (data.ok) {
          setGameDayData(data);
        }
      }
    } catch (error) {
      console.error("Failed to add participant:", error);
      alert(error instanceof Error ? error.message : "Failed to add participant");
    } finally {
      setManagingParticipants(false);
    }
  }

  async function handleRemoveParticipant(memberId: string) {
    if (!roundId) return;

    setManagingParticipants(true);
    try {
      const res = await fetch(`/api/gameday/${roundId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "remove", memberId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to remove participant");
      }

      // Reload GameDay data
      const gameDayRes = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (gameDayRes.ok) {
        const data = await gameDayRes.json();
        if (data.ok) {
          setGameDayData(data);
        }
      }
    } catch (error) {
      console.error("Failed to remove participant:", error);
      alert(error instanceof Error ? error.message : "Failed to remove participant");
    } finally {
      setManagingParticipants(false);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (!gameDayData) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">Round not found</p>
          <Link href="/" className="mt-4 inline-block text-sm text-brand-green hover:underline">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">GameDay</h1>
        <p className="mt-2 text-sm text-muted">Your round is live</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <div>
          <div className="text-sm font-medium text-muted uppercase tracking-wide mb-2">Round</div>
          <div className="text-lg font-semibold text-foreground">Round #{gameDayData.roundId}</div>
          <div className="text-sm text-muted mt-1">
            Status: <span className="capitalize">{gameDayData.status.replace("_", " ")}</span>
          </div>
        </div>

        {!gameDayData.courseId && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="text-sm font-medium text-foreground mb-2">Select course</div>
            <p className="text-xs text-muted mb-3">Choose a course before scoring</p>
            <select
              className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-foreground"
              disabled={updatingCourse}
              onChange={async (e) => {
                const courseId = e.target.value;
                if (courseId) {
                  await handleCourseSelect(courseId);
                }
              }}
            >
              <option value="">Select a course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name} {course.location ? `- ${course.location}` : ""}
                </option>
              ))}
            </select>
            {updatingCourse && (
              <p className="text-xs text-muted mt-2">Updating course…</p>
            )}
          </div>
        )}

        {gameDayData.courseId && (
          <div>
            <div className="text-sm font-medium text-muted uppercase tracking-wide mb-2">Course</div>
            <div className="text-sm text-foreground">
              {courses.find((c) => c.id === gameDayData.courseId)?.name || "Course selected"}
            </div>
          </div>
        )}

        <div>
          <div className="text-sm font-medium text-muted uppercase tracking-wide mb-2">Participants</div>
          {gameDayData.participants.length === 0 ? (
            <div className="text-sm text-muted">No participants yet</div>
          ) : (
            <div className="space-y-2">
              {gameDayData.participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <span className="text-sm text-foreground">{p.displayName}</span>
                  {currentMemberId && (currentMemberId === p.id || true) && (
                    <button
                      onClick={() => handleRemoveParticipant(p.id)}
                      disabled={managingParticipants}
                      className="text-xs text-muted hover:text-foreground disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {currentMemberId && (
            <button
              onClick={() => handleAddParticipant(currentMemberId)}
              disabled={managingParticipants || gameDayData.participants.some((p) => p.id === currentMemberId)}
              className="mt-2 text-xs text-brand-green hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {gameDayData.participants.some((p) => p.id === currentMemberId) ? "You're in" : "Add yourself"}
            </button>
          )}
        </div>

        <div className="pt-4 border-t border-border">
          <Link
            href={`/trips/${gameDayData.roundId}`}
            className="block w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 text-center"
          >
            Exit GameDay
          </Link>
        </div>
      </div>
    </div>
  );
}
