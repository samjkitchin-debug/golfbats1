import { getClubSlug, isSupabaseConfigured } from "./supabaseClient";
import { createSupabaseBrowserClient } from "./supabaseBrowser";

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
  postedAtUtc: string;
  leaderboard: { name: string; points: number }[];
  notes?: string;
};

export type Trip = {
  id: number;

  courseId: string | null;
  teeId: string | null;

  course?: string;

  date: string; // YYYY-MM-DD
  format: string;
  ferry?: string;
  capacity: number;

  status: TripStatus;

  cutoffAtUtc?: string | null;
  logistics?: TripLogistics;
  attendees: Attendee[];
  result?: TripResult;

  createdAtUtc?: string;
  updatedAtUtc?: string;
};

const LS_KEY = "golfbats:trips:v1";

function getSupabase() {
  return createSupabaseBrowserClient();
}

export function loadTrips(): Trip[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Trip[]) : [];
  } catch {
    return [];
  }
}

export function saveTrips(trips: Trip[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(trips));
}

export function sortTripsByDateAsc(trips: Trip[]) {
  return [...trips].sort((a, b) => a.date.localeCompare(b.date));
}

export async function refreshTripsFromDb(): Promise<Trip[]> {
  if (!isSupabaseConfigured()) return loadTrips();

  const supabase = getSupabase();
  const club = getClubSlug();

  const { data, error } = await supabase
    .from("trips")
    .select(
      "id,courseId,teeId,course,date,format,ferry,capacity,status,cutoffAtUtc,logistics,attendees,result,createdAtUtc,updatedAtUtc"
    )
    .eq("club", club)
    .order("date", { ascending: true });

  if (error) return loadTrips();

  const trips = (data ?? []) as Trip[];
  saveTrips(trips);
  return trips;
}

export function getTripById(tripId: number): Trip | undefined {
  return loadTrips().find((t) => t.id === tripId);
}

export async function createTrip(input: Omit<Trip, "id" | "attendees" | "status"> & Partial<Pick<Trip, "status">>) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");

  const supabase = getSupabase();
  const club = getClubSlug();

  // Your IDs are numeric; simplest is to let DB generate if it’s serial/identity.
  // But your current type says id: number and your code elsewhere seems to set it.
  // We’ll keep your existing pattern: create locally, then insert with that id if present.
  // If your DB uses identity, set id to undefined and let DB return it.
  const trips = loadTrips();

  const nextId = trips.reduce((m, t) => Math.max(m, t.id), 0) + 1;

  const next: Trip = {
    id: nextId,
    courseId: input.courseId ?? null,
    teeId: input.teeId ?? null,
    course: input.course,
    date: input.date,
    format: input.format,
    ferry: input.ferry,
    capacity: input.capacity,
    status: input.status ?? "open",
    cutoffAtUtc: input.cutoffAtUtc ?? null,
    logistics: input.logistics,
    attendees: [],
    result: input.result,
  };

  const { error } = await supabase.from("trips").insert({
    club,
    ...next,
  });

  if (error) throw error;

  const updated = sortTripsByDateAsc([...trips, next]);
  saveTrips(updated);
  return next;
}

export async function updateTrip(tripId: number, patch: Partial<Trip>) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");

  const trips = loadTrips();
  const idx = trips.findIndex((t) => t.id === tripId);
  if (idx === -1) throw new Error("Trip not found");

  const current = trips[idx];
  const next: Trip = {
    ...current,
    ...patch,
    id: current.id,
  };

  const supabase = getSupabase();
  const club = getClubSlug();

  const { error } = await supabase
    .from("trips")
    .update(next)
    .eq("club", club)
    .eq("id", tripId);

  if (error) throw error;

  const updated = [...trips];
  updated[idx] = next;
  saveTrips(sortTripsByDateAsc(updated));

  return next;
}

export async function deleteTrip(tripId: number) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");

  const supabase = getSupabase();
  const club = getClubSlug();

  const { error } = await supabase.from("trips").delete().eq("club", club).eq("id", tripId);
  if (error) throw error;

  const trips = loadTrips().filter((t) => t.id !== tripId);
  saveTrips(trips);
}

export async function setTripStatus(tripId: number, status: TripStatus) {
  return updateTrip(tripId, { status });
}

export async function setTripCutoff(tripId: number, cutoffAtUtc: string | null) {
  return updateTrip(tripId, { cutoffAtUtc });
}

export async function setTripLogistics(tripId: number, logistics: TripLogistics | undefined) {
  return updateTrip(tripId, { logistics });
}

export async function publishTripResult(tripId: number, payload: TripResult) {
  return updateTrip(tripId, { result: payload });
}

export async function unpublishTripResult(tripId: number) {
  return updateTrip(tripId, { result: undefined });
}

async function mirrorAttendeeUpsert(tripId: number, attendee: Attendee) {
  // Helper keeps DB in sync with local-first state
  if (!isSupabaseConfigured()) return;

  const supabase = getSupabase();
  const club = getClubSlug();

  // Update just attendees array for the trip
  const trips = loadTrips();
  const t = trips.find((x) => x.id === tripId);
  if (!t) return;

  const { error } = await supabase
    .from("trips")
    .update({ attendees: t.attendees })
    .eq("club", club)
    .eq("id", tripId);

  if (error) {
    // Non-fatal; UI is local-first
  }
}

export async function setAttendance(tripId: number, user: string, status: AttendanceStatus) {
  const trips = loadTrips();

  const updated = trips.map((t) => {
    if (t.id !== tripId) return t;

    const attendees = t.attendees.some((a) => a.name === user)
      ? t.attendees.map((a) => (a.name === user ? { ...a, status, joinedAt: Date.now() } : a))
      : [...t.attendees, { name: user, status, joinedAt: Date.now() }];

    const next = { ...t, attendees };
    return next;
  });

  saveTrips(updated);

  // Mirror to DB
  const t = updated.find((x) => x.id === tripId);
  const a = t?.attendees.find((x) => x.name === user);
  if (a) void mirrorAttendeeUpsert(tripId, a);

  return updated;
}

export async function setHandicapForTrip(tripId: number, user: string, handicap: number | null) {
  const trips = loadTrips();

  const updated = trips.map((t) => {
    if (t.id !== tripId) return t;

    const attendees = t.attendees.map((a) =>
      a.name === user ? { ...a, handicapForTrip: handicap } : a
    );

    const next = { ...t, attendees };
    return next;
  });

  saveTrips(updated);

  const t = updated.find((x) => x.id === tripId);
  const a = t?.attendees.find((x) => x.name === user);
  if (a) void mirrorAttendeeUpsert(tripId, a);

  return updated;
}
