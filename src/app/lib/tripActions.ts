/**
 * Trip Actions (database-backed)
 *
 * This file MUST export the functions imported by:
 * - /admin/page.tsx
 * - /admin/trips/[id]/page.tsx
 * - /(member)/trips/[id]/page.tsx
 *
 * All operations now use the database API:
 * - loadTrips() fetches from /api/trips
 * - createTrip, updateTrip, deleteTrip use POST/DELETE to /api/trips
 * - joinTrip, leaveTrip, setMyHandicapForTrip use /api/trips/[id]/* routes
 * - publishTripResult, clearTripResult use /api/trips/[id]/result
 * - types match pages (cutoffAt is string | undefined; courseId/teeId are string | null)
 */

import { perfMark, perfMeasure, perfLog } from "./perf";

export type AttendanceStatus = "confirmed" | "waitlist" | "out";

export type Attendee = {
  name: string;
  status: AttendanceStatus;
  joinedAt: number;
  handicapForTrip?: number | null;
  /** Optional Supabase member_id (UUID) so we can reliably match the current user */
  memberId?: string;
};

export type TripStatus = "open" | "closed" | "archived" | "cancelled";

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

  /** Trip scenario key (e.g. 'local_round', 'away_day', 'overnight_trip', etc.) */
  scenarioKey?: string | null;

  logistics?: TripLogistics;

  attendees: Attendee[];

  result?: TripResult;

  createdAtUtc?: string;
  updatedAtUtc?: string;
};

/* ================================
   Utilities
================================ */

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

    scenarioKey: (t as any).scenarioKey !== undefined ? ((t as any).scenarioKey ?? null) : undefined,

    logistics: (t as any).logistics ?? {},

    attendees: Array.isArray((t as any).attendees)
      ? (t as any).attendees.map((a: any): Attendee => ({
          name: String(a?.name ?? ""),
          status: isAttendanceStatus(a?.status) ? a.status : "out",
          joinedAt: Number(a?.joinedAt ?? Date.now()),
          handicapForTrip: a?.handicapForTrip ?? null,
          memberId: a?.memberId ? String(a.memberId) : undefined,
        }))
      : [],

    result: (t as any).result ?? undefined,

    createdAtUtc: (t as any).createdAtUtc ?? undefined,
    updatedAtUtc: (t as any).updatedAtUtc ?? undefined,
  };
}

/* ================================
   Storage - Database API
================================ */

/**
 * Load trips from database API for a specific group
 * No longer uses localStorage - always fetches from server
 * @param groupId - Required group ID to filter trips
 * @param bypassCache - Whether to bypass cache
 */
export async function loadTrips(groupId: string, bypassCache = false): Promise<Trip[]> {
  if (typeof window === "undefined") return [];

  if (!groupId) {
    perfLog("loadTrips: error", { error: "groupId is required" });
    return [];
  }

  const start = perfMark("loadTrips");
  try {
    const url = bypassCache 
      ? `/api/trips?groupId=${encodeURIComponent(groupId)}&bypassCache=true` 
      : `/api/trips?groupId=${encodeURIComponent(groupId)}`;
    
    const res = await fetch(url, {
      credentials: "include", // Include cookies for authentication
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Suppress error logging for 401 Unauthorized (user may have signed out)
      if (res.status !== 401) {
        perfLog("loadTrips: API error", { status: res.status, error: json?.error });
      }
      perfMeasure("loadTrips", start);
      return [];
    }

    const trips = json.trips || [];
    const normalized = trips.map(normalizeTrip);
    
    const duration = perfMeasure("loadTrips", start);
    perfLog("loadTrips: success", {
      durationMs: duration.toFixed(2),
      groupId,
      bypassCache,
      count: normalized.length,
    });
    
    return normalized;
  } catch (error) {
    perfMeasure("loadTrips", start);
    perfLog("loadTrips: exception", { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

/**
 * @deprecated Trips are now saved via individual API calls (createTrip, updateTrip, etc.)
 * This function does nothing.
 */
export function saveTrips(trips: Trip[]) {
  // No-op: trips are stored in database via API routes
}

/* ================================
   Helpers
================================ */

export function sortTripsByDateAsc(trips: Trip[]) {
  return [...trips].sort((a, b) => a.date.localeCompare(b.date));
}

// Get current time in SGT (UTC+8)
function nowInSGT(): Date {
  const now = new Date();
  // SGT is UTC+8, so add 8 hours to UTC
  const sgtOffset = 8 * 60 * 60 * 1000;
  return new Date(now.getTime() + sgtOffset);
}

// Check if cutoff has passed (11:59pm SGT on cutoff date)
function isCutoffPassed(cutoffAt: string | undefined): boolean {
  if (!cutoffAt) return false;
  const cutoff = new Date(cutoffAt);
  const now = nowInSGT();
  return now > cutoff;
}

export function isTripLocked(trip: Trip) {
  if (trip.status !== "open") return true;
  if (isCutoffPassed(trip.cutoffAt)) return true;
  return false;
}

/* ================================
   CRUD reducers
================================ */

export async function createTrip(
  trips: Trip[],
  groupId: string,
  partial: Partial<Trip> = {}
): Promise<{ trips: Trip[]; newTripId: number | null }> {
  if (!groupId) {
    throw new Error("groupId is required to create a trip");
  }

  // IMPORTANT: Trip name is REQUIRED (Option B). User-entered name and date must never be overridden.
  // Build raw trip object for API (don't normalize - API expects raw structure)
  // The API will validate and normalize the data itself
  const tripPayload = {
    id: 0, // Temporary, will be set by server
    name: partial.name, // REQUIRED - API validates
    date: partial.date ?? new Date().toISOString().slice(0, 10), // REQUIRED - API validates
    format: partial.format ?? "Stableford",
    ferry: partial.ferry ?? null,
    capacity: Number.isFinite(Number(partial.capacity)) ? Number(partial.capacity) : 16,
    status: partial.status ?? "open",
    cutoffAt: partial.cutoffAt ?? null, // API expects null or ISO string
    courseId: partial.courseId ?? null,
    teeId: partial.teeId ?? null,
    scenarioKey: partial.scenarioKey !== undefined ? (partial.scenarioKey || null) : null,
    logistics: partial.logistics ? {
      meetingPoint: partial.logistics.meetingPoint ?? null,
      meetTime: partial.logistics.meetTime ?? null,
      ferryDetails: partial.logistics.ferryDetails ?? null,
      notes: partial.logistics.notes ?? null,
    } : null,
    attendees: partial.attendees ?? [],
    result: partial.result ?? null,
    createdAtUtc: partial.createdAtUtc ?? nowIsoUtc(),
    updatedAtUtc: nowIsoUtc(),
  };

  try {
    const res = await fetch("/api/trips", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trip: tripPayload, groupId }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error || "Failed to create trip.");
    }

    // The API returns the new trip's legacy_id in json.id
    const newTripId = json?.id;
    
    // Reload trips for this group
    const allTrips = await loadTrips(groupId, true);
    
    // Verify the new trip is in the list
    if (newTripId && !allTrips.find((t: Trip) => t.id === newTripId)) {
      perfLog("createTrip: new trip not found in reload", { newTripId, groupId });
    }
    
    return { trips: allTrips, newTripId: newTripId || null };
  } catch (error) {
    perfLog("createTrip: error", { groupId, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function updateTrip(trips: Trip[], tripId: number, groupId: string, patch: Partial<Trip>): Promise<Trip[]> {
  if (!groupId) {
    throw new Error("groupId is required to update a trip");
  }

  let base = trips.find((t) => normalizeTrip(t).id === tripId);
  
  // If trip not found in local array, fetch it from server
  if (!base) {
    const fetchedTrips = await loadTrips(groupId, true);
    base = fetchedTrips.find((t) => t.id === tripId);
    if (!base) {
      throw new Error(`Trip not found (ID: ${tripId})`);
    }
  }

  const normalized = normalizeTrip(base);

  // preserve nullability rules:
  const updated: Trip = normalizeTrip({
    ...normalized,
    ...patch,
    id: normalized.id,

    // courseId/teeId must remain string | null (not undefined)
    courseId: patch.courseId === undefined ? normalized.courseId : patch.courseId,
    teeId: patch.teeId === undefined ? normalized.teeId : patch.teeId,

    // cutoffAt must be string | undefined (not null)
    cutoffAt: patch.cutoffAt === (null as any) ? undefined : patch.cutoffAt,

    logistics: patch.logistics ? { ...(normalized.logistics ?? {}), ...patch.logistics } : normalized.logistics,

    updatedAtUtc: nowIsoUtc(),
  });

  try {
    const res = await fetch("/api/trips", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trip: updated, id: tripId, groupId }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error || "Failed to update trip.");
    }

    // Reload trips from server for this group
    return await loadTrips(groupId, true);
  } catch (error) {
    perfLog("updateTrip: error", { tripId, groupId, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function deleteTrip(trips: Trip[], tripId: number, groupId: string): Promise<Trip[]> {
  if (!groupId) {
    throw new Error("groupId is required to delete a trip");
  }

  try {
    const res = await fetch("/api/trips", {
      method: "DELETE",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: tripId, groupId }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error || "Failed to delete trip.");
    }

    // Reload trips from server for this group
    return await loadTrips(groupId, true);
  } catch (error) {
    perfLog("deleteTrip: error", { tripId, groupId, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function setTripCourse(
  trips: Trip[],
  tripId: number,
  groupId: string,
  courseId: string | null,
  teeId: string | null
): Promise<Trip[]> {
  return updateTrip(trips, tripId, groupId, { courseId, teeId });
}

export async function setTripLogistics(
  trips: Trip[],
  tripId: number,
  groupId: string,
  logistics: TripLogistics
): Promise<Trip[]> {
  return updateTrip(trips, tripId, groupId, { logistics });
}

/* ================================
   Results (Admin)
================================ */

export async function publishTripResult(
  trips: Trip[],
  tripId: number,
  groupId: string,
  payload: TripResult | { leaderboard: { name: string; points: number }[]; notes?: string }
): Promise<Trip[]> {
  try {
    const res = await fetch(`/api/trips/${tripId}/result`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leaderboard: (payload as any).leaderboard ?? [],
        notes: (payload as any).notes,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error || "Failed to publish result.");
    }

    // Reload trips from server
    return await loadTrips(groupId, true);
  } catch (error) {
    perfLog("publishTripResult: error", { tripId, groupId, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function clearTripResult(trips: Trip[], tripId: number, groupId: string): Promise<Trip[]> {
  try {
    const res = await fetch(`/api/trips/${tripId}/result`, {
      method: "DELETE",
      credentials: "include",
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error || "Failed to clear result.");
    }

    // Reload trips from server
    return await loadTrips(groupId, true);
  } catch (error) {
    perfLog("clearTripResult: error", { tripId, groupId, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/* ================================
   RSVP + handicap snapshot (Member)
================================ */

export async function joinTrip(trips: Trip[], tripId: number, handicap: number | null = null, groupId?: string): Promise<Trip[]> {
  try {
    const res = await fetch(`/api/trips/${tripId}/join`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handicap }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error || "Failed to join trip.");
    }

    // Prefer the authoritative trip snapshot returned by the API, if present
    if (json && json.trip) {
      const snapshot = normalizeTrip(json.trip);
      const remaining = trips.filter((t) => t.id !== snapshot.id);
      const merged = [...remaining, snapshot];
      return sortTripsByDateAsc(merged);
    }

    // Fallback: reload trips if groupId is provided (caller should handle reload)
    if (groupId) {
      perfLog("joinTrip: fallback reload", { tripId, groupId });
      return await loadTrips(groupId, true);
    }

    // No groupId and no snapshot - return trips as-is (caller should handle reload)
    perfLog("joinTrip: no snapshot or groupId", { tripId });
    return trips;
  } catch (error) {
    perfLog("joinTrip: error", { tripId, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function leaveTrip(trips: Trip[], tripId: number, groupId?: string): Promise<Trip[]> {
  try {
    const res = await fetch(`/api/trips/${tripId}/leave`, {
      method: "POST",
      credentials: "include",
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error || "Failed to leave trip.");
    }

    // Reload trips from server with cache bypass if groupId is provided (caller should handle reload)
    if (groupId) {
      return await loadTrips(groupId, true);
    }

    // No groupId - return trips as-is (caller should handle reload)
    perfLog("leaveTrip: no groupId", { tripId });
    return trips;
  } catch (error) {
    perfLog("leaveTrip: error", { tripId, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function setMyHandicapForTrip(
  trips: Trip[],
  tripId: number,
  handicap: number | null,
  groupId?: string
): Promise<Trip[]> {
  try {
    const res = await fetch(`/api/trips/${tripId}/handicap`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handicap }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error || "Failed to update handicap.");
    }

    // Reload trips from server if groupId is provided (caller should handle reload)
    if (groupId) {
      return await loadTrips(groupId, true);
    }

    // No groupId - return trips as-is (caller should handle reload)
    perfLog("setMyHandicapForTrip: no groupId", { tripId });
    return trips;
  } catch (error) {
    perfLog("setMyHandicapForTrip: error", { tripId, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
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
