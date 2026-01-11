"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadCourses, type Course } from "../../lib/courseActions";
import { getTripCourseText, formatTripDateLong } from "../../lib/tripDisplay";
import { loadTrips, type Trip } from "../../lib/tripActions";
import { perfMark, perfMeasure, perfLog } from "../../lib/perf";
import { getGolfNoun } from "../../lib/roundNounHelper";

// Get today's date in Singapore time (SGT = UTC+8)
function getTodaySGT(): string {
  const now = new Date();
  // SGT is UTC+8, so add 8 hours to UTC
  const sgtOffset = 8 * 60 * 60 * 1000;
  const nowSGT = new Date(now.getTime() + sgtOffset);
  return nowSGT.toISOString().slice(0, 10);
}

// Helper to format date with day for rows (2 lines: weekday + date)
function formatTripRowDate(date: string): { weekday: string; date: string } {
  const d = new Date(date + "T00:00:00");
  return {
    weekday: d.toLocaleDateString("en-GB", { weekday: "short" }),
    date: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
  };
}

// Helper to format full date with day for expanded view
function formatTripFullDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ResultsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [approvedGroups, setApprovedGroups] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [allTripsWithGroups, setAllTripsWithGroups] = useState<Array<Trip & { groupName: string; groupId: string }>>([]);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [expandedTripId, setExpandedTripId] = useState<number | null>(null);

  useEffect(() => {
    document.title = "DayForeIt - Results";
  }, []);

  // Bootstrap: fetch user, member profile, and group data in one call
  useEffect(() => {
    async function loadBootstrap() {
      const start = perfMark("bootstrap");
      try {
        const res = await fetch("/api/me/bootstrap", { credentials: "include" });
        if (!res.ok) {
          if (res.status === 401) {
            perfMeasure("bootstrap", start);
            setLoadingBootstrap(false);
            return;
          }
          throw new Error("Failed to load bootstrap data");
        }

        const bootstrap = await res.json();
        
        setCurrentUserId(bootstrap.userId);
        setCurrentUserName(bootstrap.member?.display_name || bootstrap.member?.full_name || null);
        setApprovedGroups(bootstrap.approvedGroups || []);
        
        const duration = perfMeasure("bootstrap", start);
        perfLog("bootstrap: success", {
          durationMs: duration.toFixed(2),
          membershipCount: bootstrap.approvedGroups?.length || 0,
        });
      } catch (error) {
        perfMeasure("bootstrap", start);
        perfLog("bootstrap: error", { error: error instanceof Error ? error.message : String(error) });
      } finally {
        setLoadingBootstrap(false);
      }
    }
    loadBootstrap();
  }, []);

  // Load trips and courses from all approved groups
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
          loadCourses()
        ]);
        
        const allTripsWithGroupsData = allTripsArrays.flat();
        setAllTripsWithGroups(allTripsWithGroupsData);
        setCourses(coursesData);
      } catch (error) {
        perfLog("loadData: error", { error: error instanceof Error ? error.message : String(error) });
      }
    }
    loadData();
  }, [approvedGroups]);

  const todaySGT = useMemo(() => getTodaySGT(), []);

  // Past trips: date < today OR has results/published
  const pastTrips = useMemo(() => {
    return allTripsWithGroups
      .filter((t) => {
        // Include trips with date < today (past trips)
        if (t.date < todaySGT) return true;
        // Include trips with results/published
        if (t.result) return true;
        return false;
      })
      .sort((a, b) => b.date.localeCompare(a.date)); // Most recent first
  }, [allTripsWithGroups, todaySGT]);

  // Get user's most recent played result
  const userLatestResult = useMemo(() => {
    if (!currentUserId && !currentUserName) return null;
    
    return pastTrips.find((trip) => {
      if (!trip.result) return false;
      const myEntry = currentUserId
        ? trip.attendees.find((a) => a.memberId && a.memberId === currentUserId)
        : currentUserName
        ? trip.attendees.find((a) => a.name === currentUserName)
        : undefined;
      return myEntry?.status === "confirmed";
    }) || null;
  }, [pastTrips, currentUserId, currentUserName]);

  // Get most recent past trip (by trip_date)
  const latestPastTrip = useMemo(() => {
    return pastTrips[0] || null;
  }, [pastTrips]);

  // Helper to check if user participated in a trip
  function userParticipated(trip: Trip): boolean {
    if (!currentUserId && !currentUserName) return false;
    const myEntry = currentUserId
      ? trip.attendees.find((a) => a.memberId && a.memberId === currentUserId)
      : currentUserName
      ? trip.attendees.find((a) => a.name === currentUserName)
      : undefined;
    return myEntry?.status === "confirmed" || false;
  }

  // Helper to get badge for collapsed row
  function getRowBadge(trip: Trip & { groupName?: string; groupId?: string }): { label: string; style: string } {
    const participated = userParticipated(trip);
    const hasResults = !!trip.result;
    
    if (participated) {
      return { label: "Played", style: "bg-brand-green/10 text-brand-green" };
    }
    if (!participated) {
      return { label: "DNP", style: "bg-muted/10 text-muted" };
    }
    // This shouldn't happen but fallback
    return { label: "Pending", style: "bg-muted/5 text-muted" };
  }

  // Helper component for past trip row (accordion style like Trips page)
  function PastTripRow({ trip, isExpanded, onToggle }: { trip: Trip & { groupName?: string; groupId?: string }; isExpanded: boolean; onToggle: () => void }) {
    const courseText = getTripCourseText(trip, courses);
    const tripName = trip.name || courseText.title || (getGolfNoun(trip) === "trip" ? "Trip" : "Round");
    const tripDateParts = formatTripRowDate(trip.date);
    const groupName = trip.groupName || "";
    const course = trip.courseId ? courses.find((c) => c.id === trip.courseId) : undefined;
    const courseName = course?.name || (courseText.title && courseText.title !== "Course TBD" ? courseText.title.split(" — ")[0] : "Course TBC");
    const badge = getRowBadge(trip);
    const participated = userParticipated(trip);
    const hasResults = !!trip.result;
    
    // Get user's score/points from leaderboard if available
    const userScore = trip.result?.leaderboard?.find(
      (entry) => entry.name === currentUserName || entry.name === (currentUserId ? undefined : "")
    );

    return (
      <div className="rounded-lg border border-border bg-surface">
        {/* Collapsed row - fixed 3-column grid for strict alignment */}
        <button
          onClick={onToggle}
          className="w-full grid grid-cols-[auto_1fr_auto] gap-2 sm:gap-3 items-start py-2 px-2.5 sm:py-2.5 sm:px-4 rounded-lg hover:bg-surface/80 transition-colors text-left"
        >
          {/* Date column (adaptive width, 2 lines: weekday + date) */}
          <div className="flex flex-col leading-tight shrink-0 w-fit min-w-[48px] sm:min-w-[56px]">
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{tripDateParts.weekday}</span>
            <span className="text-xs font-medium text-foreground tabular-nums whitespace-nowrap">{tripDateParts.date}</span>
          </div>
          
          {/* Trip name column (2 lines: trip name + group • course) */}
          <div className="min-w-0 flex flex-col gap-0.5 sm:gap-0.5">
            <span className="text-sm sm:text-sm font-medium text-foreground break-words sm:truncate">{tripName}</span>
            <span className="text-[11px] sm:text-xs text-muted-foreground break-words sm:truncate leading-tight">
              {groupName ? `${groupName} • ${courseName}` : courseName}
            </span>
          </div>
          
          {/* Right column (adaptive width, right aligned): Badge + Chevron */}
          <div className="flex items-center justify-end gap-1 sm:gap-1.5 shrink-0">
            <span className={`text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full ${badge.style} shrink-0 whitespace-nowrap`}>
              {badge.label}
            </span>
            <span className={`text-muted/50 text-[10px] shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
              ▼
            </span>
          </div>
        </button>

        {/* Expanded content - matches Latest trip card style */}
        {isExpanded && (
          <div className="border-t border-border px-3 sm:px-4 py-3">
            <div className="text-sm font-medium text-foreground mb-1">
              {formatTripFullDate(trip.date)}
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              {groupName ? `${groupName} • ` : ""}
              {courseName}
            </div>
            
            {/* Results: 1st, 2nd, 3rd, and member's result */}
            {trip.result?.leaderboard && trip.result.leaderboard.length > 0 ? (
              <div className="space-y-2 mb-3">
                {trip.result.leaderboard.slice(0, 3).map((entry, index) => (
                  <div key={entry.name} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">
                      {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"} {entry.name}
                    </span>
                    <span className="text-foreground font-medium">
                      {entry.points ? `${entry.points} pts` : "—"}
                    </span>
                  </div>
                ))}
                {/* Show member's result if not already in top 3 */}
                {(() => {
                  const participated = userParticipated(trip);
                  if (!participated) return null;
                  
                  const userEntry = trip.result.leaderboard.find(
                    (entry) => {
                      if (currentUserName && entry.name === currentUserName) return true;
                      if (currentUserId) {
                        const myAttendee = trip.attendees.find(
                          (a) => a.memberId === currentUserId && a.status === "confirmed"
                        );
                        if (myAttendee && entry.name === myAttendee.name) return true;
                      }
                      return false;
                    }
                  );
                  const isInTop3 = userEntry && trip.result.leaderboard.indexOf(userEntry) < 3;
                  if (userEntry && !isInTop3) {
                    return (
                      <div className="flex items-center justify-between text-xs pt-2 border-t border-border/50">
                        <span className="text-brand-green font-medium">You</span>
                        <span className="text-brand-green font-medium">
                          {userEntry.points ? `${userEntry.points} pts` : "—"}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mb-3">
                Top scores: coming soon
              </div>
            )}

            {/* CTA */}
            <div className="flex items-center gap-2 pt-1">
              <Link
                href={`/results/${trip.id}`}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background transition-colors"
              >
                View trip results
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (loadingBootstrap) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Results</h1>
        </div>
        <div className="text-sm text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Results</h1>
      </div>

      {/* Your Results tile (primary) */}
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-medium text-muted-foreground mb-2">Your results</h2>
        {userLatestResult ? (
          <div>
            <div className="font-semibold text-foreground">
              {userLatestResult.name || getTripCourseText(userLatestResult, courses).title}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatTripDateLong(userLatestResult.date)}
            </div>
            {userLatestResult.result?.leaderboard && (
              <div className="mt-3">
                <Link
                  href={`/results/${userLatestResult.id}`}
                  className="inline-block rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background transition-colors"
                >
                  View result
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Results will appear here after your first round.
            </p>
            <Link
              href="/trips"
              className="inline-block rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background transition-colors"
            >
              View upcoming trips
            </Link>
          </div>
        )}
      </section>

      {/* Latest Trip Results tile (secondary) */}
      {latestPastTrip && (
        <section className="rounded-lg border border-border bg-surface/50 p-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-2">Latest trip</h2>
          <div>
            <div className="font-medium text-foreground">
              {latestPastTrip.name || getTripCourseText(latestPastTrip, courses).title}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatTripDateLong(latestPastTrip.date)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {latestPastTrip.groupName ? `${latestPastTrip.groupName} • ` : ""}
              {courses.find((c) => c.id === latestPastTrip.courseId)?.name || "Course TBC"}
            </div>
            
            {/* Results: 1st, 2nd, 3rd, and member's result */}
            {latestPastTrip.result?.leaderboard && latestPastTrip.result.leaderboard.length > 0 ? (
              <div className="mt-3 space-y-2">
                {latestPastTrip.result.leaderboard.slice(0, 3).map((entry, index) => (
                  <div key={entry.name} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">
                      {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"} {entry.name}
                    </span>
                    <span className="text-foreground font-medium">
                      {entry.points ? `${entry.points} pts` : "—"}
                    </span>
                  </div>
                ))}
                {/* Show member's result if not already in top 3 */}
                {(() => {
                  const participated = userParticipated(latestPastTrip);
                  if (!participated) return null;
                  
                  const userEntry = latestPastTrip.result.leaderboard.find(
                    (entry) => {
                      if (currentUserName && entry.name === currentUserName) return true;
                      if (currentUserId) {
                        const myAttendee = latestPastTrip.attendees.find(
                          (a) => a.memberId === currentUserId && a.status === "confirmed"
                        );
                        if (myAttendee && entry.name === myAttendee.name) return true;
                      }
                      return false;
                    }
                  );
                  const isInTop3 = userEntry && latestPastTrip.result.leaderboard.indexOf(userEntry) < 3;
                  if (userEntry && !isInTop3) {
                    return (
                      <div className="flex items-center justify-between text-xs pt-2 border-t border-border/50">
                        <span className="text-brand-green font-medium">You</span>
                        <span className="text-brand-green font-medium">
                          {userEntry.points ? `${userEntry.points} pts` : "—"}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mt-2">
                Top scores: coming soon
              </div>
            )}
            
            <div className="mt-3">
              <Link
                href={`/results/${latestPastTrip.id}`}
                className="inline-block rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background transition-colors"
              >
                View trip results
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Leaderboard tile (placeholder) */}
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-medium text-muted-foreground">Leaderboard</h2>
          {approvedGroups.length > 1 && (
            <select className="text-xs rounded-md border border-border bg-surface px-2 py-1 text-foreground">
              {approvedGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Coming soon — season standings across all groups
        </p>
        {/* Placeholder table */}
        <div className="space-y-2 text-xs text-muted">
          <div className="flex items-center justify-between py-1 border-b border-border/50">
            <span>1. —</span>
            <span>— pts</span>
          </div>
          <div className="flex items-center justify-between py-1 border-b border-border/50">
            <span>2. —</span>
            <span>— pts</span>
          </div>
          <div className="flex items-center justify-between py-1 border-b border-border/50">
            <span>3. —</span>
            <span>— pts</span>
          </div>
        </div>
      </section>

      {/* Past results list (accordion) */}
      {pastTrips.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Past trips</h2>
          <div className="space-y-1.5">
            {pastTrips.map((trip) => (
              <PastTripRow
                key={trip.id}
                trip={trip}
                isExpanded={expandedTripId === trip.id}
                onToggle={() => {
                  setExpandedTripId(expandedTripId === trip.id ? null : trip.id);
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
