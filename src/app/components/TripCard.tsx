import Link from "next/link";
import type { Trip, AttendanceStatus } from "../lib/tripActions";
import type { Course } from "../lib/courseActions";
import { formatTripDateLong } from "../lib/tripDisplay";
import { TripRsvpActions } from "./TripRsvpActions";

type CourseText = {
  title: string;
  detail?: string | null;
};

type TripCardProps = {
  trip: Trip;
  courseText: CourseText;
  course?: Course | undefined; // Optional course object for location access
  variant?: "home" | "list";
  headerLabel?: string; // e.g., "Next trip", "Current trip"
  isCurrentTrip?: boolean;
  isScheduled?: boolean;
  signupOpenDateYmd?: string | null;
  myEntry?: { name?: string; memberId?: string; status?: AttendanceStatus } | undefined;
  confirmedCount?: number;
  tripPhase?: "scheduled" | "openForSignups" | "signupsClosed" | "gameDay" | "results" | "archived";
  joinDisabled?: boolean;
  onJoin?: () => void;
  onLeave?: () => void;
};

export function TripCard({
  trip,
  courseText,
  course,
  variant = "list",
  headerLabel,
  isCurrentTrip = false,
  isScheduled = false,
  signupOpenDateYmd,
  myEntry,
  confirmedCount,
  tripPhase,
  joinDisabled = false,
  onJoin,
  onLeave,
}: TripCardProps) {
  const isHome = variant === "home";

  // Parse course name and tee from courseText.title (format: "Course Name — Tee Label" or just "Course Name")
  const courseName = courseText.title.includes(" — ")
    ? courseText.title.split(" — ")[0]
    : courseText.title !== "Course TBD"
    ? courseText.title
    : null;
  const teeLabel = courseText.title.includes(" — ")
    ? courseText.title.split(" — ")[1]
    : null;

  // Extract metrics from courseText.detail (format: "6000m · Par 72 · Slope 120")
  const metricsParts = courseText.detail?.split(" · ") || [];
  const meters = metricsParts.find((p) => p.endsWith("m")) || null;
  const par = metricsParts.find((p) => p.startsWith("Par "))?.replace("Par ", "") || null;
  const slope = metricsParts.find((p) => p.startsWith("Slope "))?.replace("Slope ", "") || null;

  // Build golf details secondary line: "Blue Tees · Stableford · 6000m · Par 72 · Slope 120"
  const golfDetailsSecondaryParts: string[] = [];
  if (teeLabel) golfDetailsSecondaryParts.push(teeLabel);
  if (trip.format) golfDetailsSecondaryParts.push(trip.format);
  if (meters) golfDetailsSecondaryParts.push(meters);
  if (par) golfDetailsSecondaryParts.push(`Par ${par}`);
  if (slope) golfDetailsSecondaryParts.push(`Slope ${slope}`);
  const golfDetailsSecondary = golfDetailsSecondaryParts.length > 0
    ? golfDetailsSecondaryParts.join(" · ")
    : null;

  // Extract time from meetTime (format might be "8:00am" or "8:00 AM" or similar)
  const meetTime = trip.logistics?.meetTime?.trim() || null;

  // Get ferry name (from ferry field - only shown in logistics block)
  const ferryName = trip.ferry?.trim() || null;

  // Get meeting point
  const meetingPoint = trip.logistics?.meetingPoint?.trim() || null;

  // Trip state: "Open for sign up" + confirmed count (muted)
  const tripStateText =
    trip.status === "cancelled"
      ? null
      : isScheduled && signupOpenDateYmd
      ? `Signups open ${formatTripDateLong(signupOpenDateYmd)}`
      : trip.status === "open" && !isScheduled
      ? "Open for sign up"
      : trip.status === "closed"
      ? "Signups closed"
      : null;

  return (
    <div className={isHome ? "rounded-xl border border-border bg-surface p-5" : ""}>
      {/* Header: Label + Details button (Home variant only) */}
      {isHome && headerLabel && (
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-sm text-muted">{headerLabel}</div>
          <Link
            href={`/trips/${trip.id}`}
            className="shrink-0 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-background"
          >
            Details
          </Link>
        </div>
      )}

      {/* Trip Name + Details Button (List variant) */}
      {!isHome && (
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-lg font-semibold text-foreground">
            {trip.name || "Trip"}
          </div>
          <Link
            href={`/trips/${trip.id}`}
            className="shrink-0 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-background"
          >
            Details
          </Link>
        </div>
      )}

      {/* Trip name (Home variant) */}
      {isHome && (
        <div className="text-lg font-semibold text-foreground mb-3">
          {trip.name || courseName || "Trip"}
        </div>
      )}

      {/* Cancelled info box */}
      {trip.status === "cancelled" && (
        <div className="mb-3 rounded-lg border border-border bg-surface/50 p-3">
          <div className={`${isHome ? "text-sm text-foreground font-semibold" : "text-sm text-foreground font-medium"}`}>
            This trip has been cancelled.
          </div>
        </div>
      )}

      {/* Scheduled info box (Home variant) */}
      {isHome && trip.status !== "cancelled" && isScheduled && (
        <div className="mb-3 rounded-lg border border-border bg-surface/50 p-3">
          <div className="text-sm text-foreground">
            <span className="font-semibold">Scheduled trip</span> — Date and course
            shown for planning. Signups will open 30 days before the trip date.
          </div>
        </div>
      )}

      {/* Game Day info box (Home variant) */}
      {isHome && trip.status !== "cancelled" && isCurrentTrip && (
        <div className="mb-3 rounded-lg border border-border bg-surface/50 p-3">
          <div className="text-sm text-foreground">
            <span className="font-semibold">Game day</span> — The round is in
            progress. Results will be posted after the round.
          </div>
        </div>
      )}

      {/* 1) Golf details block */}
      {(courseName || courseText.title !== "Course TBD") && (
        <div className="mb-3">
          {/* Primary line: Course name + location */}
          <div className={`${isHome ? "text-base" : "text-base"} font-medium text-foreground`}>
            {courseName || courseText.title}
            {course?.location && (
              <span className="text-muted"> · {course.location}</span>
            )}
          </div>
          {/* Secondary line: Tee + format + metrics */}
          {golfDetailsSecondary && (
            <div className={`${isHome ? "text-sm" : "text-sm"} text-muted mt-1`}>
              {golfDetailsSecondary}
            </div>
          )}
        </div>
      )}

      {/* 2) Time block */}
      <div className="mb-3 space-y-0.5">
        <div className={`${isHome ? "text-sm" : "text-sm"} text-foreground font-medium`}>
          {formatTripDateLong(trip.date)}
        </div>
        {meetTime && (
          <div className={`${isHome ? "text-sm" : "text-sm"} text-muted`}>
            {meetTime}
          </div>
        )}
      </div>

      {/* 3) Logistics block (single coherent group) */}
      {(meetingPoint || ferryName) && (
        <div className="mb-3 space-y-1 text-sm text-foreground">
          {meetingPoint && <div>{meetingPoint}</div>}
          {ferryName && <div>Ferry: {ferryName}</div>}
        </div>
      )}

      {/* Logistics placeholder for Signups Closed/Game Day without logistics */}
      {!meetingPoint &&
        !ferryName &&
        (tripPhase === "signupsClosed" || tripPhase === "gameDay") && (
          <div className="mb-3 rounded-lg bg-surface/50 px-4 py-3 border border-border">
            <div className="text-xs text-muted">Logistics coming soon</div>
          </div>
        )}

      {/* 4) Trip state block (muted) */}
      {tripStateText && (
        <div className="mb-2 text-sm text-muted">
          {tripStateText}
          {confirmedCount !== undefined && trip.status !== "cancelled" && (
            <span className="ml-2">· {confirmedCount} confirmed</span>
          )}
        </div>
      )}

      {/* 5) Status/action row */}
      <TripRsvpActions
        status={myEntry?.status}
        onJoin={onJoin}
        onLeave={onLeave}
        joinDisabled={joinDisabled}
        leaveDisabled={false}
        showJoin={trip.status === "open" && !isScheduled}
        className="mt-3"
      />
    </div>
  );
}
