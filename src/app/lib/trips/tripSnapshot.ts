/**
 * TripSnapshot compiler — single read model for Trips expanded row, Trip Details chroma, Home summary.
 * Trip is canonical source of truth; no UI surface derives snapshot logic independently.
 * See docs/canon/trip-canonical-and-snapshots.md.
 */

import type { Trip } from "../tripActions";
import type { Course } from "../courseActions";
import { getTripCourseText, formatTripDateLong } from "../tripDisplay";
import { getGolfNoun } from "../roundNounHelper";
import type { InstrumentKey } from "../domain/event/eventTypes";
import type { EventContext } from "../domain/event/eventTypes";
import { getTripRequirements } from "../domain/requirements/requirementsEngine";

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

/**
 * Compile TripSnapshot from trip and optional context.
 * Rows: logistics (meet_time, meeting_point, transport_summary and notes when non-empty, travel when applicable); contract (format, spots, travel_docs_required when applicable).
 * Course appears only in metaLine (identity), not as a snapshot row. Sign-ups / progress are not emitted; BaseCamp owns workflow.
 */
export function compileTripSnapshot(args: CompileTripSnapshotArgs): TripSnapshot {
  const { trip, courses = [], groupName, visibleInstrumentKeys, event } = args;

  const courseText = getTripCourseText(trip, courses);
  const courseLabel = courseText.title && courseText.title !== "Course TBD" ? courseText.title : null;

  const { meetTime12: meetTime, meetingPoint } = getCanonicalMeet(trip);

  const fmt = trip.format?.trim();
  const formatVal = fmt ? fmt : null;

  const eventCapacity = event?.instruments.capacity?.data?.capacityLimit;
  const logisticsCapacity = (trip.logistics as { capacityLimit?: number | null })?.capacityLimit;
  let capacity: number | null;
  if (eventCapacity !== undefined) capacity = eventCapacity;
  else if (logisticsCapacity !== undefined) capacity = logisticsCapacity;
  else capacity = trip.capacity != null ? Number(trip.capacity) : null;
  const capacityLabel = capacity != null ? `${capacity} players` : "No limit";
  const confirmedCount = trip.attendees?.filter((a) => a.status === "confirmed").length ?? 0;
  let spots: string;
  if (capacity != null) spots = `${confirmedCount} of ${capacity} filled`;
  else if (confirmedCount > 0) spots = `${confirmedCount} joined`;
  else spots = "—";

  const rows: TripSnapshotRow[] = [
    { key: "meet_time", label: "Meet time", value: meetTime ?? "—" },
    { key: "meeting_point", label: "Meeting point", value: meetingPoint ?? "—" },
    { key: "format", label: "Format", value: formatVal ?? "—" },
    { key: "capacity", label: "Capacity", value: capacityLabel },
    { key: "spots", label: "Spots", value: spots },
  ];

  const opt: TripSnapshotRow[] = [];
  const transportSummary = (
    (trip.logistics as { itineraryDetails?: string; ferryDetails?: string } | undefined)?.itineraryDetails ??
    (trip.logistics as { ferryDetails?: string })?.ferryDetails ??
    ""
  ).trim();
  if (transportSummary) {
    opt.push({ key: "transport_summary", label: "Transport", value: transportSummary });
  }
  const notesVal = ((trip.logistics as { notes?: string })?.notes ?? "").trim();
  if (notesVal) {
    opt.push({ key: "notes", label: "Notes", value: notesVal });
  }
  const travelInvolved = Boolean((trip as { travelInvolved?: boolean }).travelInvolved);
  if (travelInvolved) {
    const travelType = (trip as { travelType?: string | null }).travelType;
    const travelScope = (trip as { travelScope?: string | null }).travelScope;
    const travelValue =
      (travelType ? travelType.charAt(0).toUpperCase() + travelType.slice(1) : "Travel") +
      (travelScope === "international" ? " · International" : travelScope === "domestic" ? " · Domestic" : "");
    opt.push({ key: "travel", label: "Travel", value: travelValue });
  }
  const requirements = getTripRequirements(trip);
  if (requirements.travelDocsRequired) {
    opt.push({ key: "travel_docs_required", label: "Travel docs", value: "Required" });
  }
  for (const r of opt) {
    if (rows.length >= 10) break;
    rows.push(r);
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
