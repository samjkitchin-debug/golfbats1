import { getClubSlug, isSupabaseConfigured, supabase } from "./supabaseClient";

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
  cutoffAt?: string; // ISO UTC
  logistics?: TripLogistics;

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
   Supabase bridge: club + member lookup
================================ */
let clubIdCache: string | null = null;
let clubIdPromise: Promise<string | null> | null = null;

async function getClubId(): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  if (clubIdCache) return clubIdCache;
  if (clubIdPromise) return clubIdPromise;

  clubIdPromise = (async () => {
    const slug = getClubSlug();
    const { data, error } = await supabase.from("clubs").select("id").eq("slug", slug).maybeSingle();
    if (error || !data?.id) return null;
    clubIdCache = data.id;
    return clubIdCache;
  })();

  return clubIdPromise;
}

async function getOrCreateMemberIdByName(name: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const clubId = await getClubId();
  if (!clubId) return null;

  // Try find by display_name (Phase 1 only; Phase 2 will map to auth user)
  const { data: existing } = await supabase
    .from("members")
    .select("id")
    .eq("club_id", clubId)
    .eq("display_name", name)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: inserted } = await supabase
    .from("members")
    .insert({ club_id: clubId, display_name: name, email: null, is_admin: false })
    .select("id")
    .single();

  return inserted?.id ?? null;
}

/* ================================
   Storage
================================ */
export function loadTrips(): Trip[] {
  if (!canUseStorage()) return [];

  // Fire-and-forget DB sync (keeps UI sync)
  void ensureTripsSyncedFromDb();

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
   DB Sync: pull trips and overwrite local cache
================================ */
let tripsSyncInFlight: Promise<void> | null = null;

function mapDbStatusToLocal(s: string): TripStatus {
  // DB: draft/open/locked/completed/archived
  if (s === "archived") return "archived";
  if (s === "locked" || s === "completed") return "closed";
  return "open";
}

function mapLocalStatusToDb(s: TripStatus): string {
  // keep it minimal in Phase 1
  if (s === "archived") return "archived";
  if (s === "closed") return "locked";
  return "open";
}

export async function ensureTripsSyncedFromDb(): Promise<void> {
  if (!canUseStorage()) return;
  if (!isSupabaseConfigured() || !supabase) return;
  if (tripsSyncInFlight) return tripsSyncInFlight;

  tripsSyncInFlight = (async () => {
    const clubId = await getClubId();
    if (!clubId) return;

    const { data: tripRows, error } = await supabase
      .from("trips")
      .select(
        "id,legacy_id,trip_date,format,ferry,capacity,course_id,tee_id,status,cutoff_at,meeting_point,meet_time,ferry_details,notes"
      )
      .eq("club_id", clubId)
      .order("trip_date", { ascending: true });

    if (error || !tripRows) return;

    const tripUuids = tripRows.map((t) => t.id);

    // attendees
    const { data: attRows } = await supabase
      .from("trip_attendees")
      .select("trip_id,status,joined_at,handicap_snapshot,member_id")
      .in("trip_id", tripUuids.length ? tripUuids : ["00000000-0000-0000-0000-000000000000"]);

    // member names
    const memberIds = Array.from(new Set((attRows ?? []).map((a) => a.member_id)));
    const { data: members } = await supabase
      .from("members")
      .select("id,display_name")
      .in("id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);

    const memberNameById: Record<string, string> = {};
    for (const m of members ?? []) memberNameById[m.id] = m.display_name;

    const attendeesByTrip: Record<string, Attendee[]> = {};
    for (const a of attRows ?? []) {
      const name = memberNameById[a.member_id] ?? "Unknown";
      const attendee: Attendee = {
        name,
        status: a.status === "waitlist" ? "waitlist" : "confirmed",
        joinedAt: new Date(a.joined_at).getTime(),
        handicapForTrip: a.handicap_snapshot === null ? null : Number(a.handicap_snapshot),
      };
      (attendeesByTrip[a.trip_id] ||= []).push(attendee);
    }

    // results
    const { data: resultRows } = await supabase
      .from("trip_results")
      .select("id,trip_id,published,published_at,notes")
      .in("trip_id", tripUuids.length ? tripUuids : ["00000000-0000-0000-0000-000000000000"]);

    const resultIdByTrip: Record<string, string> = {};
    for (const r of resultRows ?? []) resultIdByTrip[r.trip_id] = r.id;

    const resultIds = Array.from(new Set((resultRows ?? []).map((r) => r.id)));
    const { data: rows } = await supabase
      .from("result_rows")
      .select("result_id,position,display_name,metric_label,metric_value")
      .in("result_id", resultIds.length ? resultIds : ["00000000-0000-0000-0000-000000000000"]);

    const leaderboardByTrip: Record<string, { name: string; points: number }[]> = {};
    for (const r of resultRows ?? []) {
      if (!r.published) continue;
      const rr = (rows ?? [])
        .filter((x) => x.result_id === r.id)
        .sort((a, b) => a.position - b.position)
        .map((x) => ({ name: x.display_name, points: Number(x.metric_value) || 0 }));
      leaderboardByTrip[r.trip_id] = rr;
    }

    const merged: Trip[] = tripRows
      .filter((t) => Number.isFinite(Number(t.legacy_id)))
      .map((t) => {
        const legacyId = Number(t.legacy_id);
        const logistics: TripLogistics = {
          meetingPoint: t.meeting_point ?? undefined,
          meetTime: t.meet_time ?? undefined,
          ferryDetails: t.ferry_details ?? undefined,
          notes: t.notes ?? undefined,
        };

        const published = (resultRows ?? []).find((r) => r.trip_id === t.id && r.published);

        const result: TripResult | undefined = published
          ? {
              postedAtUtc: published.published_at ?? nowIsoUtc(),
              leaderboard: leaderboardByTrip[t.id] ?? [],
              notes: published.notes ?? undefined,
            }
          : undefined;

        const attendees = (attendeesByTrip[t.id] || []).sort((a, b) => a.joinedAt - b.joinedAt);

        return {
          id: legacyId,
          courseId: t.course_id ?? null,
          teeId: t.tee_id ?? null,
          date: t.trip_date,
          format: t.format ?? "Stroke",
          ferry: t.ferry ?? undefined,
          capacity: Number(t.capacity) || 16,
          status: mapDbStatusToLocal(t.status),
          cutoffAt: t.cutoff_at ?? undefined,
          logistics:
            logistics.meetingPoint || logistics.meetTime || logistics.ferryDetails || logistics.notes
              ? logistics
              : undefined,
          result,
          attendees,
        };
      });

    saveTrips(merged);
  })().finally(() => {
    tripsSyncInFlight = null;
  });

  return tripsSyncInFlight;
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
  if (currentConfirmed % 4 === 3) return true;
  const next = currentConfirmed + 1;
  if (next % 4 === 0) return true;
  if (next === 6) return true;
  return false;
}

/* ================================
   DB mirror helpers
================================ */
async function mirrorTripUpsert(trip: Trip) {
  if (!isSupabaseConfigured() || !supabase) return;
  const clubId = await getClubId();
  if (!clubId) return;

  await supabase.from("trips").upsert(
    {
      club_id: clubId,
      legacy_id: trip.id,
      trip_date: trip.date,
      format: trip.format,
      ferry: trip.ferry ?? null,
      capacity: trip.capacity,
      course_id: trip.courseId,
      tee_id: trip.teeId,
      status: mapLocalStatusToDb(trip.status),
      cutoff_at: trip.cutoffAt ?? null,
      meeting_point: trip.logistics?.meetingPoint ?? null,
      meet_time: trip.logistics?.meetTime ?? null,
      ferry_details: trip.logistics?.ferryDetails ?? null,
      notes: trip.logistics?.notes ?? null,
    },
    { onConflict: "legacy_id" }
  );
}

async function resolveTripUuid(legacyId: number): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const clubId = await getClubId();
  if (!clubId) return null;

  const { data } = await supabase
    .from("trips")
    .select("id")
    .eq("club_id", clubId)
    .eq("legacy_id", legacyId)
    .maybeSingle();

  return data?.id ?? null;
}

async function mirrorAttendeeUpsert(tripLegacyId: number, attendee: Attendee) {
  if (!isSupabaseConfigured() || !supabase) return;

  const tripId = await resolveTripUuid(tripLegacyId);
  if (!tripId) return;

  const memberId = await getOrCreateMemberIdByName(attendee.name);
  if (!memberId) return;

  await supabase.from("trip_attendees").upsert(
    {
      trip_id: tripId,
      member_id: memberId,
      status: attendee.status === "waitlist" ? "waitlist" : "confirmed",
      joined_at: new Date(attendee.joinedAt).toISOString(),
      handicap_snapshot: attendee.handicapForTrip ?? null,
    },
    { onConflict: "trip_id,member_id" }
  );
}

async function mirrorAttendeeDelete(tripLegacyId: number, memberName: string) {
  if (!isSupabaseConfigured() || !supabase) return;

  const tripId = await resolveTripUuid(tripLegacyId);
  if (!tripId) return;

  const memberId = await getOrCreateMemberIdByName(memberName);
  if (!memberId) return;

  await supabase.from("trip_attendees").delete().eq("trip_id", tripId).eq("member_id", memberId);
}

async function mirrorResultUpsert(tripLegacyId: number, result: TripResult) {
  if (!isSupabaseConfigured() || !supabase) return;

  const tripId = await resolveTripUuid(tripLegacyId);
  if (!tripId) return;

  // upsert trip_results
  const { data: tr } = await supabase
    .from("trip_results")
    .upsert(
      {
        trip_id: tripId,
        published: true,
        published_at: result.postedAtUtc,
        notes: result.notes ?? null,
      },
      { onConflict: "trip_id" }
    )
    .select("id")
    .single();

  const resultId = tr?.id;
  if (!resultId) return;

  // replace rows (simple + reliable for Phase 1)
  await supabase.from("result_rows").delete().eq("result_id", resultId);

  const rows = result.leaderboard.map((r, idx) => ({
    result_id: resultId,
    position: idx + 1,
    display_name: r.name,
    metric_label: "Points",
    metric_value: String(r.points),
  }));

  if (rows.length) {
    await supabase.from("result_rows").insert(rows);
  }
}

async function mirrorResultClear(tripLegacyId: number) {
  if (!isSupabaseConfigured() || !supabase) return;

  const tripId = await resolveTripUuid(tripLegacyId);
  if (!tripId) return;

  await supabase.from("trip_results").delete().eq("trip_id", tripId);
}

/* ================================
   Mutations (local-first + DB mirror)
================================ */
export function createTrip(
  trips: Trip[],
  input: { date: string; format: string; capacity: number; ferry?: string; courseId: string | null; teeId: string | null }
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

  const updated = sortTripsByDateAsc([...trips, next]);
  void mirrorTripUpsert(next);
  return updated;
}

export function updateTrip(
  trips: Trip[],
  tripId: number,
  patch: Partial<Pick<Trip, "date" | "format" | "capacity" | "ferry" | "status" | "cutoffAt">>
): Trip[] {
  const updated = trips.map((t) => {
    if (t.id !== tripId) return t;
    const next = {
      ...t,
      date: patch.date !== undefined ? patch.date : t.date,
      format: patch.format !== undefined ? patch.format.trim() : t.format,
      capacity: patch.capacity !== undefined ? Number(patch.capacity) : t.capacity,
      ferry: patch.ferry !== undefined ? (patch.ferry.trim() || undefined) : t.ferry,
      status: patch.status !== undefined ? patch.status : t.status,
      cutoffAt: patch.cutoffAt !== undefined ? patch.cutoffAt : t.cutoffAt,
    };
    void mirrorTripUpsert(next);
    return next;
  });

  return sortTripsByDateAsc(updated);
}

export function setTripCourse(trips: Trip[], tripId: number, courseId: string | null, teeId: string | null): Trip[] {
  const updated = trips.map((t) => {
    if (t.id !== tripId) return t;
    const next = { ...t, courseId, teeId };
    void mirrorTripUpsert(next);
    return next;
  });
  return updated;
}

export function setTripLogistics(trips: Trip[], tripId: number, logistics: TripLogistics): Trip[] {
  const updated = trips.map((t) => {
    if (t.id !== tripId) return t;
    const next = { ...t, logistics };
    void mirrorTripUpsert(next);
    return next;
  });
  return updated;
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

  const updated = trips.map((t) => (t.id === tripId ? { ...t, result: payload } : t));
  void mirrorResultUpsert(tripId, payload);
  return updated;
}

export function clearTripResult(trips: Trip[], tripId: number): Trip[] {
  const updated = trips.map((t) => (t.id === tripId ? { ...t, result: undefined } : t));
  void mirrorResultClear(tripId);
  return updated;
}

export function joinTrip(trips: Trip[], tripId: number, user: string): Trip[] {
  const updated = trips.map((t) => {
    if (t.id !== tripId) return t;
    if (isTripLocked(t)) return t;

    const existing = t.attendees.find((a) => a.name === user);
    if (existing?.status === "confirmed") return t;

    const confirmedCount = t.attendees.filter((a) => a.status === "confirmed").length;
    const status: AttendanceStatus = canConfirmNow(confirmedCount) ? "confirmed" : "waitlist";

    const attendees = existing
      ? t.attendees.map((a) => (a.name === user ? { ...a, status, joinedAt: Date.now() } : a))
      : [...t.attendees, { name: user, status, joinedAt: Date.now() }];

    const next = { ...t, attendees };

    const me = attendees.find((a) => a.name === user);
    if (me) void mirrorAttendeeUpsert(tripId, me);

    return next;
  });

  return updated;
}

export function leaveTrip(trips: Trip[], tripId: number, user: string): Trip[] {
  const updated = trips.map((t) => {
    if (t.id !== tripId) return t;
    if (isTripLocked(t)) return t;

    let attendees = t.attendees.filter((a) => a.name !== user);

    const confirmedCount = attendees.filter((a) => a.status === "confirmed").length;

    const nextUp = attendees
      .filter((a) => a.status === "waitlist")
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];

    if (nextUp && canConfirmNow(confirmedCount)) {
      attendees = attendees.map((a) => (a.name === nextUp.name ? { ...a, status: "confirmed" } : a));
      void mirrorAttendeeUpsert(tripId, { ...nextUp, status: "confirmed" });
    }

    void mirrorAttendeeDelete(tripId, user);
    return { ...t, attendees };
  });

  return updated;
}

export function setMyHandicapForTrip(trips: Trip[], tripId: number, user: string, handicap: number | null): Trip[] {
  const updated = trips.map((t) => {
    if (t.id !== tripId) return t;

    const attendees = t.attendees.map((a) => (a.name === user ? { ...a, handicapForTrip: handicap } : a));
    const next = { ...t, attendees };

    const me = attendees.find((a) => a.name === user);
    if (me) void mirrorAttendeeUpsert(tripId, me);

    return next;
  });

  return updated;
}

/* ================================
   Export CSV (unchanged)
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
    lines.push([csvEscape(a.name), csvEscape(a.handicapForTrip?.toString() ?? ""), String(a.joinedAt)].join(","));
  }

  if (includeWaitlist) {
    lines.push("");
    lines.push("Waitlist");
    lines.push("Name,HandicapForTrip,JoinedAtUtcMs");
    for (const a of waitlist) {
      lines.push([csvEscape(a.name), csvEscape(a.handicapForTrip?.toString() ?? ""), String(a.joinedAt)].join(","));
    }
  }

  return lines.join("\n");
}
