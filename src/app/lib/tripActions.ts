/**
 * Trip Actions (local-first UI cache)
 *
 * This file MUST export the functions imported by:
 * - /admin/page.tsx
 * - /admin/trips/[id]/page.tsx
 * - /(member)/trips/[id]/page.tsx
 *
 * Keep it boring and stable:
 * - localStorage is the UI source of truth
 * - reducers return nextTrips
 * - types match pages (cutoffAt is string | undefined; courseId/teeId are string | null)
 */

export type AttendanceStatus = "confirmed" | "waitlist" | "out";

export type Attendee = {
  name: string;
  status: AttendanceStatus;
  joinedAt: number;
  handicapForTrip?: number | null;
};

export type TripStatus = "open" | "closed" | "archived";

export type TripLogistics = {
  meetingPoint?: string;
  meetTime?: string;
  ferryDetails?: string;
  notes?: string;
};

export type TripResult = {
  leaderboard: { name: string; points: number }[];
  notes?: string;
  publishedAt?: string; // ISO UTC
};

export type Trip = {
  id: number;

  /** Trip name - displayed prominently on tiles */
  name?: string;

  date: string; // YYYY-MM-DD
  format: string;

  /** legacy fallback display string used by tripDisplay.ts */
  course?: string;

  /** optional display text used in member UI */
  ferry?: string;

  capacity: number;
  status: TripStatus;

  /** IMPORTANT: admin UI helper expects string | undefined (not null) */
  cutoffAt?: string;

  /** IMPORTANT: admin UI expects nullable (string | null), not undefined */
  courseId: string | null;
  teeId: string | null;

  logistics?: TripLogistics;

  attendees: Attendee[];

  result?: TripResult;

  createdAtUtc?: string;
  updatedAtUtc?: string;
};

const LS_KEY = "golfbats:trips:v1";

/* ================================
   Utilities
================================ */

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function nowIsoUtc() {
  return new Date().toISOString();
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeName(name: string) {
  return (name || "").trim();
}

function isAttendanceStatus(v: any): v is AttendanceStatus {
  return v === "confirmed" || v === "waitlist" || v === "out";
}

function normalizeCutoffAt(v: unknown): string | undefined {
  // force null -> undefined to satisfy toDatetimeLocalValue(isoUtc?: string)
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

function normalizeTrip(input: any): Trip {
  const t = input as Trip;

  return {
    id: Number(t.id),
    name: t.name ?? undefined,
    date: String(t.date ?? ""),
    format: String(t.format ?? ""),

    course: t.course ?? undefined,
    ferry: t.ferry ?? undefined,

    capacity: Number.isFinite(Number(t.capacity)) ? Number(t.capacity) : 0,
    status: (t.status ?? "open") as TripStatus,

    cutoffAt: normalizeCutoffAt((t as any).cutoffAt),

    courseId: (t as any).courseId ?? null,
    teeId: (t as any).teeId ?? null,

    logistics: (t as any).logistics ?? {},

    attendees: Array.isArray((t as any).attendees)
      ? (t as any).attendees.map((a: any): Attendee => ({
          name: String(a?.name ?? ""),
          status: isAttendanceStatus(a?.status) ? a.status : "out",
          joinedAt: Number(a?.joinedAt ?? Date.now()),
          handicapForTrip: a?.handicapForTrip ?? null,
        }))
      : [],

    result: (t as any).result ?? undefined,

    createdAtUtc: (t as any).createdAtUtc ?? undefined,
    updatedAtUtc: (t as any).updatedAtUtc ?? undefined,
  };
}

/* ================================
   Storage
================================ */

export function loadTrips(): Trip[] {
  if (!canUseStorage()) return [];
  const raw = window.localStorage.getItem(LS_KEY);
  const parsed = safeJsonParse<any[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeTrip);
}

export function saveTrips(trips: Trip[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(trips));
}

/* ================================
   Helpers
================================ */

export function sortTripsByDateAsc(trips: Trip[]) {
  return [...trips].sort((a, b) => a.date.localeCompare(b.date));
}

export function isTripLocked(trip: Trip) {
  if (trip.status !== "open") return true;
  if (trip.cutoffAt) {
    const cutoff = new Date(trip.cutoffAt).getTime();
    if (!Number.isNaN(cutoff) && Date.now() > cutoff) return true;
  }
  return false;
}

/* ================================
   CRUD reducers
================================ */

export function createTrip(trips: Trip[], partial: Partial<Trip> = {}): Trip[] {
  const maxId = trips.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0);
  const id = maxId + 1;

  const nextTrip: Trip = normalizeTrip({
    id,
    name: partial.name,
    date: partial.date ?? new Date().toISOString().slice(0, 10),
    format: partial.format ?? "Stableford",

    course: partial.course,
    ferry: partial.ferry ?? "",

    capacity: Number.isFinite(Number(partial.capacity)) ? Number(partial.capacity) : 16,
    status: partial.status ?? "open",

    cutoffAt: partial.cutoffAt, // keep undefined by default

    courseId: partial.courseId ?? null,
    teeId: partial.teeId ?? null,

    logistics: partial.logistics ?? {},
    attendees: partial.attendees ?? [],

    result: partial.result,

    createdAtUtc: partial.createdAtUtc ?? nowIsoUtc(),
    updatedAtUtc: nowIsoUtc(),
  });

  const out = [nextTrip, ...trips.map(normalizeTrip)];
  saveTrips(out);
  return out;
}

export function updateTrip(trips: Trip[], tripId: number, patch: Partial<Trip>): Trip[] {
  const out = trips.map((t) => {
    const base = normalizeTrip(t);
    if (base.id !== tripId) return base;

    // preserve nullability rules:
    const next: Trip = normalizeTrip({
      ...base,
      ...patch,
      id: base.id,

      // courseId/teeId must remain string | null (not undefined)
      courseId: patch.courseId === undefined ? base.courseId : patch.courseId,
      teeId: patch.teeId === undefined ? base.teeId : patch.teeId,

      // cutoffAt must be string | undefined (not null)
      cutoffAt: patch.cutoffAt === (null as any) ? undefined : patch.cutoffAt,

      logistics: patch.logistics ? { ...(base.logistics ?? {}), ...patch.logistics } : base.logistics,

      updatedAtUtc: nowIsoUtc(),
    });

    return next;
  });

  saveTrips(out);
  return out;
}

export function deleteTrip(trips: Trip[], tripId: number): Trip[] {
  const out = trips.filter((t) => normalizeTrip(t).id !== tripId);
  saveTrips(out);
  return out;
}

export function setTripCourse(trips: Trip[], tripId: number, courseId: string | null, teeId: string | null) {
  return updateTrip(trips, tripId, { courseId, teeId });
}

export function setTripLogistics(trips: Trip[], tripId: number, logistics: TripLogistics) {
  return updateTrip(trips, tripId, { logistics });
}

/* ================================
   Results (Admin)
================================ */

export function publishTripResult(
  trips: Trip[],
  tripId: number,
  payload: TripResult | { leaderboard: { name: string; points: number }[]; notes?: string }
) {
  const result: TripResult = {
    leaderboard: (payload as any).leaderboard ?? [],
    notes: (payload as any).notes,
    publishedAt: nowIsoUtc(),
  };
  return updateTrip(trips, tripId, { result });
}

export function clearTripResult(trips: Trip[], tripId: number) {
  return updateTrip(trips, tripId, { result: undefined });
}

/* ================================
   RSVP + handicap snapshot (Member)
================================ */

export function joinTrip(trips: Trip[], tripId: number, memberName: string): Trip[] {
  const name = normalizeName(memberName);
  if (!name) return trips.map(normalizeTrip);

  const out = trips.map((t) => {
    const base = normalizeTrip(t);
    if (base.id !== tripId) return base;

    const existing = base.attendees.find((a) => a.name === name);
    const attendees: Attendee[] = existing
      ? base.attendees.map((a) => (a.name === name ? { ...a, status: "confirmed" } : a))
      : [...base.attendees, { name, status: "confirmed", joinedAt: Date.now() }];

    return normalizeTrip({ ...base, attendees, updatedAtUtc: nowIsoUtc() });
  });

  saveTrips(out);
  return out;
}

export function leaveTrip(trips: Trip[], tripId: number, memberName: string): Trip[] {
  const name = normalizeName(memberName);
  if (!name) return trips.map(normalizeTrip);

  const out = trips.map((t) => {
    const base = normalizeTrip(t);
    if (base.id !== tripId) return base;

    const attendees: Attendee[] = base.attendees.map((a) => (a.name === name ? { ...a, status: "out" } : a));
    return normalizeTrip({ ...base, attendees, updatedAtUtc: nowIsoUtc() });
  });

  saveTrips(out);
  return out;
}

export function setMyHandicapForTrip(
  trips: Trip[],
  tripId: number,
  memberName: string,
  handicap: number | null
): Trip[] {
  const name = normalizeName(memberName);
  if (!name) return trips.map(normalizeTrip);

  const out = trips.map((t) => {
    const base = normalizeTrip(t);
    if (base.id !== tripId) return base;

    const attendees: Attendee[] = base.attendees.map((a) =>
      a.name === name ? { ...a, handicapForTrip: handicap } : a
    );

    return normalizeTrip({ ...base, attendees, updatedAtUtc: nowIsoUtc() });
  });

  saveTrips(out);
  return out;
}

/* ================================
   CSV export (Admin)
================================ */

export function exportTripCsv(trip: Trip) {
  if (typeof window === "undefined") return;

  const t = normalizeTrip(trip);

  const rows: string[][] = [];
  rows.push(["Trip ID", String(t.id)]);
  rows.push(["Date", t.date]);
  rows.push(["Format", t.format]);
  rows.push(["Course (legacy)", t.course ?? ""]);
  rows.push(["Course ID", t.courseId ?? ""]);
  rows.push(["Tee ID", t.teeId ?? ""]);
  rows.push(["Ferry", t.ferry ?? ""]);
  rows.push(["Capacity", String(t.capacity)]);
  rows.push(["Status", t.status]);
  rows.push(["Cutoff (UTC)", t.cutoffAt ?? ""]);
  rows.push([]);

  rows.push(["Meeting point", t.logistics?.meetingPoint ?? ""]);
  rows.push(["Meet time", t.logistics?.meetTime ?? ""]);
  rows.push(["Ferry details", t.logistics?.ferryDetails ?? ""]);
  rows.push(["Notes", t.logistics?.notes ?? ""]);
  rows.push([]);

  rows.push(["Attendee", "Status", "Joined At (ms)", "Handicap Snapshot"]);
  for (const a of t.attendees) {
    rows.push([a.name, a.status, String(a.joinedAt ?? ""), a.handicapForTrip == null ? "" : String(a.handicapForTrip)]);
  }

  rows.push([]);
  rows.push(["Result Published At", t.result?.publishedAt ?? ""]);
  rows.push(["Result Notes", t.result?.notes ?? ""]);

  const leaderboard = t.result?.leaderboard ?? [];
  if (leaderboard.length) {
    rows.push([]);
    rows.push(["Leaderboard"]);
    rows.push(["Name", "Points"]);
    for (const r of leaderboard) rows.push([r.name, String(r.points)]);
  }

  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const v = String(cell ?? "");
          if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
          return v;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `golfbats-trip-${t.id}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

/* ================================
   Travel Agent CSV export (Admin)
   Exports trip details with member names, nationalities, and passport info
================================ */

type MemberForExport = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  nationality: string | null;
  passport_number?: string | null;
  passport_expiry?: string | null;
  passport_full_name?: string | null;
  passport_country?: string | null;
  passport_photo_url?: string | null;
};

export async function exportTravelAgentCsv(
  trip: Trip,
  getMembers: () => Promise<MemberForExport[]>
) {
  if (typeof window === "undefined") return;

  const t = normalizeTrip(trip);

  // Fetch all members from database
  const members = await getMembers();

  // Get confirmed attendees only
  const confirmedAttendees = t.attendees.filter((a) => a.status === "confirmed");

  // Match attendees to members by name (display_name or full_name)
  const attendeeRows: string[][] = [];
  attendeeRows.push([
    "Name",
    "Nationality",
    "Passport Full Name",
    "Passport Number",
    "Passport Country",
    "Passport Expiry",
    "Passport Photo URL",
  ]);

  for (const attendee of confirmedAttendees) {
    // Try to find matching member by display_name or full_name
    const member = members.find(
      (m) =>
        (m.display_name && m.display_name.toLowerCase() === attendee.name.toLowerCase()) ||
        (m.full_name && m.full_name.toLowerCase() === attendee.name.toLowerCase())
    );

    attendeeRows.push([
      attendee.name,
      member?.nationality ?? "",
      member?.passport_full_name ?? "",
      member?.passport_number ?? "",
      member?.passport_country ?? "",
      member?.passport_expiry ?? "",
      member?.passport_photo_url ?? "",
    ]);
  }

  // Build CSV with trip details and attendees
  const rows: string[][] = [];
  rows.push(["Trip Date", t.date]);
  rows.push(["Format", t.format]);
  rows.push(["Course", t.course ?? ""]);
  rows.push(["Ferry", t.ferry ?? ""]);
  rows.push(["Meeting Point", t.logistics?.meetingPoint ?? ""]);
  rows.push(["Meet Time", t.logistics?.meetTime ?? ""]);
  rows.push(["Ferry Details", t.logistics?.ferryDetails ?? ""]);
  rows.push(["Notes", t.logistics?.notes ?? ""]);
  rows.push([]);
  rows.push(...attendeeRows);

  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const v = String(cell ?? "");
          if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
          return v;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `travel-agent-trip-${t.id}-${t.date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}
