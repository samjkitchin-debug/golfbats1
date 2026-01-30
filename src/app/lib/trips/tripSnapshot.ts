/**
 * TripSnapshot compiler — single read model for Trips expanded row, Trip Details chroma, Home summary.
 * Trip is canonical source of truth; no UI surface derives snapshot logic independently.
 * See docs/canon/trip-canonical-and-snapshots.md.
 */

import type { Trip } from "../tripActions";
import type { Course } from "../courseActions";
import { getTripCourseText, formatTripDateLong } from "../tripDisplay";
import { getGolfNoun } from "../roundNounHelper";
import { resolveSignupPhase } from "../tripPhase";
import type { InstrumentKey } from "../domain/event/eventTypes";
import type { EventContext } from "../domain/event/eventTypes";

export type TripSnapshotRow = { key: string; label: string; value: string };

export type TripSnapshot = {
  tripId: number;
  title: string;
  metaLine: string | null;
  dateLine: string | null;
  hostLine: string | null;
  rows: TripSnapshotRow[];
};

export type CompileTripSnapshotArgs = {
  trip: Trip;
  courses?: Course[];
  groupName?: string | null;
  /** When provided with event, optional slots (Logistics, Transport, Agent pack) are appended up to row cap. */
  visibleInstrumentKeys?: InstrumentKey[];
  event?: EventContext | null;
};

function formatTime12(s: string): string {
  if (!s?.trim()) return "";
  const [h, m] = s.trim().split(":").map(Number);
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const period = h >= 12 ? "pm" : "am";
  return `${h12}:${String(m ?? 0).padStart(2, "0")}${period}`;
}

/** Single canonical source for meet time/point: decisionLogistics then logistics. */
export function getCanonicalMeet(trip: Trip): {
  meetTimeRaw: string | null;
  meetTime12: string | null;
  meetingPoint: string | null;
} {
  const meetTimeRaw = (
    (trip.decisionLogistics?.meetTime ?? (trip.logistics as { meetTime?: string })?.meetTime) ?? ""
  ).trim() || null;
  const meetingPoint = (
    (trip.decisionLogistics?.meetingPoint ?? (trip.logistics as { meetingPoint?: string })?.meetingPoint) ?? ""
  ).trim() || null;
  return {
    meetTimeRaw,
    meetTime12: meetTimeRaw ? formatTime12(meetTimeRaw) : null,
    meetingPoint,
  };
}

function formatCloseDateShort(cutoffAt: string | undefined | null): string | null {
  if (!cutoffAt) return null;
  try {
    const d = new Date(cutoffAt);
    const dayName = d.toLocaleDateString("en-GB", { weekday: "short" });
    const day = d.getDate();
    const mon = d.toLocaleDateString("en-GB", { month: "short" });
    return `${dayName} ${day} ${mon}`;
  } catch {
    return null;
  }
}

/** Single canonical mapping for sign-ups display. Uses resolveSignupPhase / trip phase helpers. */
function getSignupsDisplayValue(trip: Trip): string {
  const now = Date.now();
  const phase = resolveSignupPhase(trip, now);

  if (phase === "locked") return "Closed";
  if (phase === "signups_open") {
    const closes = formatCloseDateShort(trip.cutoffAt ?? undefined);
    return closes ? `Open (closes ${closes})` : "Open";
  }
  return "Not open";
}

/**
 * Compile TripSnapshot from trip and optional context.
 * Meet time / meeting point: decisionLogistics then logistics (single rule everywhere).
 * Course: getTripCourseText. Format: empty or "Stroke" => "—". Spots / Sign-ups per spec.
 */
export function compileTripSnapshot(args: CompileTripSnapshotArgs): TripSnapshot {
  const { trip, courses = [], groupName, visibleInstrumentKeys, event } = args;

  const courseText = getTripCourseText(trip, courses);
  const courseLabel = courseText.title && courseText.title !== "Course TBD" ? courseText.title : null;

  const { meetTime12: meetTime, meetingPoint } = getCanonicalMeet(trip);

  const fmt = trip.format?.trim();
  const formatVal = fmt && fmt !== "Stroke" ? fmt : null;

  const capacity = event
    ? (event.instruments.capacity?.data?.capacityLimit ?? (trip.logistics as { capacityLimit?: number | null })?.capacityLimit ?? (trip.capacity != null ? Number(trip.capacity) : null))
    : (trip.logistics as { capacityLimit?: number | null })?.capacityLimit ?? (trip.capacity != null ? Number(trip.capacity) : null);
  const confirmedCount = trip.attendees?.filter((a) => a.status === "confirmed").length ?? 0;
  let spots: string;
  if (capacity != null) spots = `${confirmedCount} of ${capacity} filled`;
  else if (confirmedCount > 0) spots = `${confirmedCount} joined`;
  else spots = "—";

  const signupsVal = getSignupsDisplayValue(trip);

  const rows: TripSnapshotRow[] = [
    { key: "meet_time", label: "Meet time", value: meetTime ?? "—" },
    { key: "meeting_point", label: "Meeting point", value: meetingPoint ?? "—" },
    { key: "course", label: "Course", value: courseLabel ?? "—" },
    { key: "format", label: "Format", value: formatVal ?? "—" },
    { key: "spots", label: "Spots", value: spots },
    { key: "signups", label: "Sign-ups", value: signupsVal },
  ];

  if (visibleInstrumentKeys && event) {
    const opt: TripSnapshotRow[] = [];
    if (visibleInstrumentKeys.includes("flights_plan")) {
      const hasTransport = Boolean(
        (trip.logistics?.itineraryDetails ?? "").trim() || (trip.logistics?.ferryDetails ?? "").trim()
      );
      opt.push({ key: "transport", label: "Transport", value: hasTransport ? "Planned" : "—" });
    }
    if (visibleInstrumentKeys.includes("export_docs")) {
      const done = event.instruments.export_docs.status === "done";
      opt.push({ key: "export_docs", label: "Agent pack", value: done ? "Exported" : "Not exported" });
    }
    for (const r of opt) {
      if (rows.length >= 10) break;
      rows.push(r);
    }
  }

  const title = trip.tripName ?? trip.name ?? (getGolfNoun(trip) === "trip" ? "Trip" : "Round");
  let metaLine: string | null = null;
  if (groupName && courseLabel) metaLine = `${groupName} · ${courseLabel}`;
  else if (courseLabel) metaLine = courseLabel;
  else if (groupName) metaLine = groupName;

  const dateLine = trip.date ? formatTripDateLong(trip.date) : null;
  const hostLine = trip.hostedByLabel ?? null;

  return {
    tripId: trip.id,
    title,
    metaLine,
    dateLine,
    hostLine,
    rows,
  };
}
