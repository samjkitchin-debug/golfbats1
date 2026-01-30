"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadCourses, type Course } from "../../../lib/courseActions";
import { getTripCourseText, formatTripDateLong } from "../../../lib/tripDisplay";
import { loadTrips, type Trip } from "../../../lib/tripActions";
import { formatHandicap } from "../../../lib/format";
import { logClubhouseEvent } from "../../../lib/clubhouseEvents";

function getTodaySGT(): string {
  const now = new Date();
  const sgtOffset = 8 * 60 * 60 * 1000;
  return new Date(now.getTime() + sgtOffset).toISOString().slice(0, 10);
}

export default function MeGolfPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [approvedGroups, setApprovedGroups] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [memberHandicap, setMemberHandicap] = useState<number | null>(null);
  const [memberHandicapType, setMemberHandicapType] = useState<string | null>(null);
  const [allTripsWithGroups, setAllTripsWithGroups] = useState<Array<Trip & { groupName: string; groupId: string }>>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);

  const tabSurfaceLoggedRef = useRef(false);
  useEffect(() => {
    if (tabSurfaceLoggedRef.current) return;
    tabSurfaceLoggedRef.current = true;
    try {
      logClubhouseEvent({ event_type: "room_entered", room_id: "page:me_golf" });
    } catch { /* non-blocking */ }
  }, []);

  useEffect(() => {
    document.title = "DayForeIt - My golf";
  }, []);

  useEffect(() => {
    async function loadBootstrap() {
      try {
        const res = await fetch("/api/me/bootstrap", { credentials: "include" });
        if (!res.ok) {
          if (res.status === 401) {
            setLoadingBootstrap(false);
            return;
          }
          throw new Error("Failed to load bootstrap data");
        }
        const bootstrap = await res.json();
        setCurrentUserId(bootstrap.userId);
        setCurrentUserName(bootstrap.member?.display_name || bootstrap.member?.full_name || null);
        setApprovedGroups(bootstrap.approvedGroups || []);
        setMemberHandicap(bootstrap.member?.declared_handicap ?? null);
        setMemberHandicapType(bootstrap.member?.handicap_type ?? null);
      } catch {
        // Non-fatal
      } finally {
        setLoadingBootstrap(false);
      }
    }
    loadBootstrap();
  }, []);

  useEffect(() => {
    if (approvedGroups.length === 0) return;
    async function loadData() {
      try {
        const tripsPromises = approvedGroups.map(async (group) => {
          const groupTrips = await loadTrips(group.id, false);
          return groupTrips.map((trip) => ({ ...trip, groupName: group.name, groupId: group.id }));
        });
        const [allTripsArrays, coursesData] = await Promise.all([
          Promise.all(tripsPromises),
          loadCourses(),
        ]);
        setAllTripsWithGroups(allTripsArrays.flat());
        setCourses(coursesData);
      } catch {
        // Non-fatal
      }
    }
    loadData();
  }, [approvedGroups]);

  const todaySGT = useMemo(() => getTodaySGT(), []);

  const pastTripsWithResult = useMemo(() => {
    return allTripsWithGroups
      .filter((t) => (t.date < todaySGT || t.result) && !!t.result)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [allTripsWithGroups, todaySGT]);

  const recentRounds = useMemo(() => {
    return pastTripsWithResult
      .filter((trip) => {
        const myEntry = currentUserId
          ? trip.attendees.find((a) => a.memberId && a.memberId === currentUserId)
          : currentUserName
            ? trip.attendees.find((a) => a.name === currentUserName)
            : undefined;
        return myEntry?.status === "confirmed";
      })
      .slice(0, 5);
  }, [pastTripsWithResult, currentUserId, currentUserName]);

  if (loadingBootstrap) {
    return (
      <div className="pb-24 px-5 pt-4">
        <h1 className="text-xl font-semibold text-foreground">My golf</h1>
        <p className="mt-2 text-sm text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="pb-24 px-5 pt-4">
      <h1 className="text-xl font-semibold text-foreground">My golf</h1>
      <p className="mt-1 text-xs text-muted">Your game, your space</p>

      {/* Handicap */}
      <div className="mt-6">
        {memberHandicap !== null && memberHandicap !== undefined ? (
          <>
            <div className="text-3xl font-light text-primary">{formatHandicap(memberHandicap)}</div>
            <div className="mt-1 text-xs text-secondary">Your handicap</div>
            {memberHandicapType && (
              <div className="mt-0.5 text-xs text-muted">
                {memberHandicapType === "declared_starter"
                  ? "Starter"
                  : memberHandicapType === "declared_established"
                    ? "Established"
                    : memberHandicapType === "dayforeit_official"
                      ? "Official (Day Fore It)"
                      : ""}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-secondary">Add your handicap on your profile</div>
        )}
      </div>

      {/* Recent rounds */}
      <div className="mt-8 border-t border-border pt-6">
        <h2 className="text-sm font-medium text-foreground">Recent rounds</h2>
        {recentRounds.length === 0 ? (
          <>
            <p className="mt-2 text-sm text-muted">
              Your rounds will appear here once GameDay scoring begins.
            </p>
            <p className="mt-2 text-xs text-muted">
              Coming later: personal bests, season progress, achievements.
            </p>
          </>
        ) : (
          <ul className="mt-3 space-y-2">
            {recentRounds.map((trip) => {
              const { title } = getTripCourseText(trip, courses);
              return (
                <li key={`${trip.groupId}-${trip.id}`}>
                  <Link
                    href={`/results/${trip.id}`}
                    className="block rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm text-foreground hover:bg-surface"
                  >
                    <span className="font-medium">{title || "Trip"}</span>
                    <span className="ml-2 text-muted">{formatTripDateLong(trip.date)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
