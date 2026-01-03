export type AttendanceStatus = "confirmed" | "waitlist" | "out";

export type Attendee = {
  name: string;
  status: AttendanceStatus;
  joinedAt: number; // Date.now()
  handicapForTrip?: number | null; // optional snapshot for this trip
};

export type TripStatus = "open" | "closed" | "archived";

export type TripLogistics = {
  meetingPoint?: string;
  meetTime?: string; // "HH:MM" (SGT)
  ferryDetails?: string;
  notes?: string;
};

export type TripResult = {
  postedAtUtc: string;
  leaderboard: { name: string; points: number }[];
  notes?: string;
};

export type Trip = {
  id: number;

  // Course selection
  courseId: string | null;
  teeId: string | null;

  // Legacy fallback (old trips may still have this)
  course?: string;

  date: string; // "YYYY-MM-DD"
  format: string;
  ferry?: string;
  capacity: number;

  // Admin controls
  status: TripStatus;
  cutoffAt?: string; // ISO string in UTC (we treat it as "lock time")
  logistics?: TripLogistics;

  // Published result (admin enters summary, not hole-by-hole)
  result?: TripResult;

  attendees: Attendee[];
};

const TRIPS_STORAGE_KEY = "golfbats.trips.v1";

/* ================================
   Storage helpers (SSR-safe)
================================ */
function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function nowIsoUtc() {
  return new Date().toISOString();
}

/* ================================
   Storage
================================ */
export function loadTrips(): Trip[] {
  if (!canUseStorage()) return [];

  const raw = window.localStorage.getItem(TRIPS_STORAGE_KEY);
  const parsed = safeParse<any[]>(raw, []);
  if (!Array.isArray(parsed)) return [];

  // Migration: ensure new fields exist
  let changed = false;

  const migrated: Trip[] = parsed.map((t: any) => {
    let next = { ...t };

    if (!("courseId" in next)) {
      next.courseId = null;
      changed = true;
    }
    if (!("teeId" in next)) {
      next.teeId = null;
      changed = true;
    }
    if (!("status" in next)) {
      next.status = "open";
      changed = true;
    }
    if (!("attendees" in next) || !Array.isArray(next.attendees)) {
      next.attendees = [];
      changed = true;
    }

    return next as Trip;
  });

  if (changed) {
    try {
      window.localStorage.setItem(TRIPS_STORAGE_KEY, JSON.stringify(migrated));
    } catch {}
  }

  return migrated;
}

export function saveTrips(trips: Trip[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(TRIPS_STORAGE_KEY, JSON.stringify(trips));
  } catch {}
}

/* ================================
   Helpers
================================ */
export function isTripLocked(trip: Trip, nowUtcIso: string = nowIsoUtc()) {
  if (trip.status === "closed" || trip.status === "archived") return true;
  if (!trip.cutoffAt) return false;
  return nowUtcIso >= trip.cutoffAt;
}

export function sortTripsByDateAsc(trips: Trip[]) {
  return [...trips].sort((a, b) => a.date.localeCompare(b.date));
}

/* ================================
   Grouping rules
================================ */
export function canConfirmNow(currentConfirmed: number) {
  // allow 4th in group
  if (currentConfirmed % 4 === 3) return true;

  // allow completing groups of 4
  const next = currentConfirmed + 1;
  if (next % 4 === 0) return true;

  // allow two groups of 3 (6 total)
  if (next === 6) return true;

  return false;
}

/* ================================
   Mutations
================================ */
export function createTrip(
  trips: Trip[],
  input: {
    date: string;
    format: string;
    capacity: number;
    ferry?: string;
    courseId: string | null;
    teeId: string | null;
  }
): Trip[] {
  const maxId = trips.reduce((m, t) => Math.max(m, t.id), 0);

  const next: Trip = {
    id: maxId + 1,
    courseId: input.courseId,
    teeId: input.teeId,
    date: input.date,
    format: input.format.trim(),
    ferry: input.ferry?.trim() || undefined,
    capacity: Number(input.capacity),
    status: "open",
    attendees: [],
  };

  return sortTripsByDateAsc([...trips, next]);
}

export function updateTrip(
  trips: Trip[],
  tripId: number,
  patch: Partial<
    Pick<Trip, "date" | "format" | "capacity" | "ferry" | "status" | "cutoffAt">
  >
): Trip[] {
  const updated = trips.map((t) => {
    if (t.id !== tripId) return t;

    return {
      ...t,
      date: patch.date !== undefined ? patch.date : t.date,
      format: patch.format !== undefined ? patch.format.trim() : t.format,
      capacity: patch.capacity !== undefined ? Number(patch.capacity) : t.capacity,
      ferry: patch.ferry !== undefined ? (patch.ferry.trim() || undefined) : t.ferry,
      status: patch.status !== undefined ? patch.status : t.status,
      cutoffAt: patch.cutoffAt !== undefined ? patch.cutoffAt : t.cutoffAt,
    };
  });

  return sortTripsByDateAsc(updated);
}

export function setTripCourse(
  trips: Trip[],
  tripId: number,
  courseId: string | null,
  teeId: string | null
): Trip[] {
  return trips.map((t) => (t.id === tripId ? { ...t, courseId, teeId } : t));
}

export function setTripLogistics(
  trips: Trip[],
  tripId: number,
  logistics: TripLogistics
): Trip[] {
  return trips.map((t) => (t.id === tripId ? { ...t, logistics } : t));
}

export function publishTripResult(
  trips: Trip[],
  tripId: number,
  result: { leaderboard: { name: string; points: number }[]; notes?: string }
): Trip[] {
  const payload: TripResult = {
    postedAtUtc: nowIsoUtc(),
    leaderboard: result.leaderboard,
    notes: result.notes?.trim() || undefined,
  };

  return trips.map((t) => (t.id === tripId ? { ...t, result: payload } : t));
}

export function clearTripResult(trips: Trip[], tripId: number): Trip[] {
  return trips.map((t) => (t.id === tripId ? { ...t, result: undefined } : t));
}

export function joinTrip(trips: Trip[], tripId: number, user: string): Trip[] {
  return trips.map((t) => {
    if (t.id !== tripId) return t;
    if (isTripLocked(t)) return t;

    const existing = t.attendees.find((a) => a.name === user);
    if (existing?.status === "confirmed") return t;

    const confirmedCount = t.attendees.filter((a) => a.status === "confirmed").length;

    const status: AttendanceStatus = canConfirmNow(confirmedCount) ? "confirmed" : "waitlist";

    const attendees = existing
      ? t.attendees.map((a) =>
          a.name === user ? { ...a, status, joinedAt: Date.now() } : a
        )
      : [...t.attendees, { name: user, status, joinedAt: Date.now() }];

    return { ...t, attendees };
  });
}

export function leaveTrip(trips: Trip[], tripId: number, user: string): Trip[] {
  return trips.map((t) => {
    if (t.id !== tripId) return t;
    if (isTripLocked(t)) return t;

    // Current behavior: remove attendee entirely
    let attendees = t.attendees.filter((a) => a.name !== user);

    const confirmedCount = attendees.filter((a) => a.status === "confirmed").length;

    // FIFO waitlist promotion
    const nextUp = attendees
      .filter((a) => a.status === "waitlist")
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];

    if (nextUp && canConfirmNow(confirmedCount)) {
      attendees = attendees.map((a) =>
        a.name === nextUp.name ? { ...a, status: "confirmed" } : a
      );
    }

    return { ...t, attendees };
  });
}

export function setMyHandicapForTrip(
  trips: Trip[],
  tripId: number,
  user: string,
  handicap: number | null
): Trip[] {
  return trips.map((t) => {
    if (t.id !== tripId) return t;

    const attendees = t.attendees.map((a) =>
      a.name === user ? { ...a, handicapForTrip: handicap } : a
    );

    return { ...t, attendees };
  });
}

/* ================================
   Export (CSV)
   - V1: exports names + optional handicap snapshot
   - You can extend later to join against a shared profiles store.
================================ */
function csvEscape(v: string) {
  const s = v ?? "";
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportTripCsv(trip: Trip, options?: { includeWaitlist?: boolean }) {
  const includeWaitlist = options?.includeWaitlist ?? true;

  const confirmed = trip.attendees
    .filter((a) => a.status === "confirmed")
    .sort((a, b) => a.joinedAt - b.joinedAt);

  const waitlist = trip.attendees
    .filter((a) => a.status === "waitlist")
    .sort((a, b) => a.joinedAt - b.joinedAt);

  const lines: string[] = [];

  lines.push("Trip Date,Format,Capacity,Status,CutoffAt,Ferry");
  lines.push(
    [
      csvEscape(trip.date),
      csvEscape(trip.format),
      String(trip.capacity),
      csvEscape(trip.status),
      csvEscape(trip.cutoffAt ?? ""),
      csvEscape(trip.ferry ?? ""),
    ].join(",")
  );

  lines.push("");
  lines.push("Logistics");
  lines.push("Meeting Point,Meet Time,Ferry Details,Notes");
  lines.push(
    [
      csvEscape(trip.logistics?.meetingPoint ?? ""),
      csvEscape(trip.logistics?.meetTime ?? ""),
      csvEscape(trip.logistics?.ferryDetails ?? ""),
      csvEscape(trip.logistics?.notes ?? ""),
    ].join(",")
  );

  lines.push("");
  lines.push("Confirmed");
  lines.push("Name,HandicapForTrip,JoinedAtUtcMs");
  for (const a of confirmed) {
    lines.push(
      [csvEscape(a.name), csvEscape(a.handicapForTrip?.toString() ?? ""), String(a.joinedAt)].join(
        ","
      )
    );
  }

  if (includeWaitlist) {
    lines.push("");
    lines.push("Waitlist");
    lines.push("Name,HandicapForTrip,JoinedAtUtcMs");
    for (const a of waitlist) {
      lines.push(
        [
          csvEscape(a.name),
          csvEscape(a.handicapForTrip?.toString() ?? ""),
          String(a.joinedAt),
        ].join(",")
      );
    }
  }

  return lines.join("\n");
}
