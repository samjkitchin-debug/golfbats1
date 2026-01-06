"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { loadCourses, type Course, type Tee } from "../../../lib/courseActions";
import {
  clearTripResult,
  exportTripCsv,
  exportTravelAgentCsv,
  isTripLocked,
  loadTrips,
  publishTripResult,
  setTripCourse,
  setTripLogistics,
  updateTrip,
  type Trip,
  type TripLogistics,
  type TripStatus,
} from "../../../lib/tripActions";
import { getTripCourseText } from "../../../lib/tripDisplay";
import { createSupabaseBrowserClient } from "../../../lib/supabaseBrowser";

function toDateValue(isoUtc?: string) {
  if (!isoUtc) return "";
  const d = new Date(isoUtc);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDateValue(v: string) {
  if (!v) return undefined;
  // Set to 11:59pm local time on the chosen date
  const d = new Date(v + "T23:59:00");
  return d.toISOString();
}

function parseLeaderboard(raw: string): { name: string; points: number }[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: { name: string; points: number }[] = [];
  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim());
    const name = parts[0] || "";
    const points = Number(parts[1] ?? "");
    if (!name) continue;
    if (!Number.isFinite(points)) continue;
    rows.push({ name, points });
  }
  return rows;
}

export default function AdminTripPage() {
  const params = useParams<{ id: string }>();
  const tripId = Number(params?.id);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  const [leaderboardText, setLeaderboardText] = useState<string>("");
  const [resultNotes, setResultNotes] = useState<string>("");
  const [tripNameInput, setTripNameInput] = useState<string>("");
  const [formatInput, setFormatInput] = useState<string>("");
  const [capacityInput, setCapacityInput] = useState<string>("");
  const [cutoffDateInput, setCutoffDateInput] = useState<string>("");
  const [meetingPointInput, setMeetingPointInput] = useState<string>("");
  const [meetTimeInput, setMeetTimeInput] = useState<string>("");
  const [ferryDetailsInput, setFerryDetailsInput] = useState<string>("");
  const [logisticsNotesInput, setLogisticsNotesInput] = useState<string>("");
  const [attendeesData, setAttendeesData] = useState<Array<{
    name: string;
    display_name: string | null;
    handicap: number | null;
    profile_photo_path: string | null;
  }>>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Bypass cache to ensure we get the latest trip data
        const [tripsData, coursesData] = await Promise.all([loadTrips(true), loadCourses()]);
        console.log("Admin trip page: loaded", tripsData.length, "trips, looking for ID", tripId);
        setTrips(tripsData);
        setCourses(coursesData);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [tripId]);

  const trip = useMemo(() => {
    if (!Number.isFinite(tripId)) return undefined;
    return trips.find((t) => t.id === tripId);
  }, [trips, tripId]);

  // Keep Trip Name input in sync with loaded trip, but avoid patching on every keypress
  useEffect(() => {
    setTripNameInput(trip?.name ?? "");
    setFormatInput(trip?.format ?? "");
    setCapacityInput(String(trip?.capacity ?? ""));
    setCutoffDateInput(toDateValue(trip?.cutoffAt));
    setMeetingPointInput(trip?.logistics?.meetingPoint ?? "");
    setMeetTimeInput(trip?.logistics?.meetTime ?? "");
    setFerryDetailsInput(trip?.logistics?.ferryDetails ?? "");
    setLogisticsNotesInput(trip?.logistics?.notes ?? "");
  }, [trip?.id, trip?.name]);

  const course = useMemo(() => {
    if (!trip) return undefined;
    return courses.find((c) => c.id === trip.courseId);
  }, [courses, trip]);

  const tees: Tee[] = course?.tees ?? [];

  // Keep editor inputs synced when trip/result changes
  useEffect(() => {
    if (!trip?.result) {
      setLeaderboardText("");
      setResultNotes("");
      return;
    }
    setLeaderboardText(trip.result.leaderboard.map((r) => `${r.name},${r.points}`).join("\n"));
    setResultNotes(trip.result.notes ?? "");
  }, [trip?.id, trip?.result]);

  if (!Number.isFinite(tripId)) {
    return (
      <main className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-sm text-gray-700">Invalid trip id.</div>
      </main>
    );
  }

  if (!trip) {
    return (
      <main className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-sm text-gray-700">Trip not found.</div>
      </main>
    );
  }

  // IMPORTANT: capture stable values for closures (prevents "trip possibly undefined")
  const tripSafe = trip;
  const tripIdSafe = tripSafe.id;

  const locked = isTripLocked(tripSafe);
  const courseText = getTripCourseText(tripSafe, courses);

  // Determine trip phase
  const now = Date.now();
  const tripDate = new Date(tripSafe.date + "T00:00:00").getTime();
  const cutoffDate = tripSafe.cutoffAt ? new Date(tripSafe.cutoffAt).getTime() : null;
  const hasResults = !!tripSafe.result;
  const tripDatePassed = now >= tripDate;
  const signupOpenAt = tripDate - 30 * 24 * 60 * 60 * 1000;

  // Phase 0: Scheduled (trip is open, but signups aren't open until 30 days before trip date)
  const phase0 =
    tripSafe.status === "open" && !tripDatePassed && Number.isFinite(signupOpenAt) && now < signupOpenAt;
  
  // Phase 1: Open for signups
  const phase1 = tripSafe.status === "open" && !phase0;
  
  // Phase 2: Closed to new entrants, logistics posted (after cutoff, before trip date)
  const phase2 = tripSafe.status === "closed" && !tripDatePassed;
  
  // Phase 3: Trip date passed, ready for results
  const phase3 = tripDatePassed && !hasResults;
  
  // Phase 4: Results published, trip archived
  const phase4 = hasResults;

  async function commit(next: Trip[]) {
    setTrips(next);
  }

  async function patchTrip(patch: Parameters<typeof updateTrip>[2]) {
    try {
      const updated = await updateTrip(trips, tripIdSafe, patch);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to update trip:", error);
      alert(`Failed to update trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onSetCourse(courseId: string | null) {
    // Reset tee when course changes
    try {
      const updated = await setTripCourse(trips, tripIdSafe, courseId, null);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to set course:", error);
      alert(`Failed to set course: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onSetTee(teeId: string | null) {
    try {
      const updated = await setTripCourse(trips, tripIdSafe, tripSafe.courseId, teeId);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to set tee:", error);
      alert(`Failed to set tee: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onSetLogistics(next: TripLogistics) {
    try {
      const updated = await setTripLogistics(trips, tripIdSafe, next);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to set logistics:", error);
      alert(`Failed to set logistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onCloseTripAndPostLogistics() {
    // Close trip to new entrants and enable logistics (move to Phase 2)
    try {
      const updated = await updateTrip(trips, tripIdSafe, { status: "closed" });
      setTrips(updated);
    } catch (error) {
      console.error("Failed to close trip:", error);
      alert(`Failed to close trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onTripCompletedPostResults() {
    // Mark trip as completed and ready for results (move to Phase 3)
    // Set trip date to today if it hasn't passed yet
    const today = new Date().toISOString().split("T")[0];
    if (tripSafe.date > today) {
      try {
        const updated = await updateTrip(trips, tripIdSafe, { date: today });
        setTrips(updated);
      } catch (error) {
        console.error("Failed to mark trip completed:", error);
        alert(`Failed to mark trip completed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  async function onReopenTrip() {
    // Reopen trip to allow more attendees (go back to Phase 1)
    try {
      const updated = await updateTrip(trips, tripIdSafe, { status: "open" });
      setTrips(updated);
    } catch (error) {
      console.error("Failed to reopen trip:", error);
      alert(`Failed to reopen trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }


  async function onPublish() {
    const leaderboard = parseLeaderboard(leaderboardText);
    try {
      // Publish results and archive the trip (move to Phase 4)
      const updated = await publishTripResult(trips, tripIdSafe, {
        leaderboard,
        notes: resultNotes || undefined,
      });
      setTrips(updated);
    } catch (error) {
      console.error("Failed to publish results:", error);
      alert(`Failed to publish results: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onClearResult() {
    try {
      const updated = await clearTripResult(trips, tripIdSafe);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to clear result:", error);
      alert(`Failed to clear result: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function onExportCsv() {
    exportTripCsv(tripSafe);
  }

  async function onExportTravelAgentCsv() {
    try {
      const supabase = createSupabaseBrowserClient();
      
      // Get confirmed attendees
      const confirmedAttendees = tripSafe.attendees.filter((a) => a.status === "confirmed");
      
      // Fetch all members from database
      const { data: members, error } = await supabase
        .from("members")
        .select("id,email,full_name,display_name,nationality");
      
      if (error) {
        alert(`Failed to fetch members: ${error.message}`);
        return;
      }

      // Match attendees to member IDs
      const memberIds: string[] = [];
      const nameToMemberId: Record<string, string> = {};
      
      for (const attendee of confirmedAttendees) {
        const member = members?.find(
          (m) =>
            (m.display_name && m.display_name.toLowerCase() === attendee.name.toLowerCase()) ||
            (m.full_name && m.full_name.toLowerCase() === attendee.name.toLowerCase())
        );
        
        if (member?.id) {
          if (!memberIds.includes(member.id)) {
            memberIds.push(member.id);
          }
          nameToMemberId[attendee.name.toLowerCase()] = member.id;
        }
      }

      // Fetch passport data from server (includes decryption and signed URLs)
      type PassportData = {
        user_id: string;
        passport_full_name: string | null;
        passport_number: string | null;
        passport_country: string | null;
        passport_expiry_date: string | null;
        passport_photo_url: string | null;
      };
      
      const passportDataMap: Record<string, PassportData> = {};
      if (memberIds.length > 0) {
        const passportRes = await fetch(`/admin/trips/${params.id}/passport-export`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ memberIds }),
        });

        const passportJson = await passportRes.json().catch(() => ({}));

        if (passportRes.ok && passportJson.passports) {
          // Create a map of user_id -> passport data
          for (const passport of passportJson.passports as PassportData[]) {
            passportDataMap[passport.user_id] = passport;
          }
        } else {
          console.warn("Failed to fetch passport data:", passportJson.error);
        }
      }

      // Map to the format expected by exportTravelAgentCsv
      const membersForExport = (members || []).map((m) => {
        const passport = passportDataMap[m.id];
        return {
          id: m.id,
          email: m.email,
          full_name: m.full_name,
          display_name: m.display_name,
          nationality: m.nationality,
          passport_number: passport?.passport_number || null,
          passport_expiry: passport?.passport_expiry_date || null,
          passport_full_name: passport?.passport_full_name || null,
          passport_country: passport?.passport_country || null,
          passport_photo_url: passport?.passport_photo_url || null,
        };
      });

      await exportTravelAgentCsv(tripSafe, async () => membersForExport);
    } catch (error) {
      alert(`Failed to export: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <main className="flex flex-col gap-6">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="text-xl font-semibold text-gray-900">
            Trip #{tripSafe.id} • {tripSafe.date} • {tripSafe.format}
          </div>

          <div className="text-sm text-gray-600">
            {courseText.title}
            {courseText.detail ? <span className="text-gray-500"> • {courseText.detail}</span> : null}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {phase0 && (
                <div className="inline-flex w-fit rounded-full bg-purple-100 px-3 py-1 text-xs text-purple-700">
                  Phase 0: Scheduled (signups open {new Date(signupOpenAt).toISOString().slice(0, 10)})
                </div>
              )}
              {phase1 && (
                <div className="inline-flex w-fit rounded-full bg-green-100 px-3 py-1 text-xs text-green-700">
                  Phase 1: Open for signups
                </div>
              )}
              {phase2 && (
                <div className="inline-flex w-fit rounded-full bg-yellow-100 px-3 py-1 text-xs text-yellow-700">
                  Phase 2: Closed, logistics posted
                </div>
              )}
              {phase3 && (
                <div className="inline-flex w-fit rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700">
                  Phase 3: Ready for results
                </div>
              )}
              {phase4 && (
                <div className="inline-flex w-fit rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                  Archived: Results published
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Status:</label>
              <select
                className="rounded-lg border border-gray-300 px-3 py-1 text-sm"
                value={tripSafe.status}
                onChange={(e) => patchTrip({ status: e.target.value as TripStatus })}
              >
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Attendees Section - Show in all phases, but especially in Phase 1 */}
      {(phase0 || phase1 || phase2 || phase3 || phase4 || tripSafe.attendees.filter((a) => a.status === "confirmed").length > 0) && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Attendees</h2>
          
          {loadingAttendees ? (
            <div className="text-sm text-gray-600">Loading attendees…</div>
          ) : attendeesData.length === 0 ? (
            <div className="text-sm text-gray-600">No confirmed attendees yet.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {attendeesData.map((attendee, idx) => {
                const photoUrl = attendee.profile_photo_path
                  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${attendee.profile_photo_path}`
                  : null;

                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 p-3"
                  >
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt={attendee.display_name || attendee.name}
                        className="h-12 w-12 flex-shrink-0 rounded-full object-cover border border-gray-300"
                      />
                    ) : (
                      <div className="h-12 w-12 flex-shrink-0 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center text-xs font-medium text-gray-600">
                        {(attendee.display_name || attendee.name).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {attendee.display_name || attendee.name}
                      </div>
                      {attendee.handicap !== null && (
                        <div className="text-xs text-gray-600">
                          HCP: {attendee.handicap}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Phase 0: Scheduled - Minimum details (Date and Course) required for members to plan ahead */}
      {phase0 && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Phase 0: Scheduled</h2>
          <p className="mb-4 text-sm text-gray-600">
            Set the date and course so members can see where the trip is and plan ahead. Signups will open 30 days before the trip date.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <div className="text-sm font-medium text-gray-800">Date <span className="text-red-600">*</span></div>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                type="date"
                value={tripSafe.date}
                onChange={(e) => patchTrip({ date: e.target.value })}
              />
            </label>

            <label className="block">
              <div className="text-sm font-medium text-gray-800">Format</div>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={formatInput}
                onChange={(e) => setFormatInput(e.target.value)}
                onBlur={() => {
                  if ((tripSafe.format ?? "") !== (formatInput ?? "")) {
                    void patchTrip({ format: formatInput || "" });
                  }
                }}
              />
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-gray-800">Course <span className="text-red-600">*</span></div>
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={tripSafe.courseId ?? ""}
                onChange={(e) => onSetCourse(e.target.value || null)}
              >
                <option value="">Select course…</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-gray-800">Tee</div>
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={tripSafe.teeId ?? ""}
                onChange={(e) => onSetTee(e.target.value || null)}
                disabled={!tripSafe.courseId}
              >
                <option value="">Select tee…</option>
                {tees.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} • {t.meters}m • Par {t.par} • Slope {t.slope}
                  </option>
                ))}
              </select>
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-gray-800">Trip Name</div>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                type="text"
                value={tripNameInput}
                onChange={(e) => setTripNameInput(e.target.value)}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next === (tripSafe.name ?? "")) return;
                  void patchTrip({ name: next || undefined });
                }}
                placeholder="e.g. Batam Weekend Getaway"
              />
            </label>
          </div>
        </section>
      )}

      {/* Phase 1: Basics - Only show when trip is open and before cutoff */}
      {phase1 && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Phase 1: Trip Details</h2>

          <div className="grid gap-3 md:grid-cols-2">
          <label className="block md:col-span-2">
            <div className="text-sm font-medium text-gray-800">Trip Name</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              type="text"
              value={tripNameInput}
              onChange={(e) => setTripNameInput(e.target.value)}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next === (tripSafe.name ?? "")) return;
                void patchTrip({ name: next || undefined });
              }}
              placeholder="e.g. Batam Weekend Getaway"
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-800">Date</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              type="date"
              value={tripSafe.date}
              onChange={(e) => patchTrip({ date: e.target.value })}
              disabled={locked}
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-800">Format</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={formatInput}
              onChange={(e) => setFormatInput(e.target.value)}
              onBlur={() => {
                if ((tripSafe.format ?? "") !== (formatInput ?? "")) {
                  void patchTrip({ format: formatInput || "" });
                }
              }}
              disabled={locked}
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-800">Capacity</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              type="number"
              value={capacityInput}
              onChange={(e) => setCapacityInput(e.target.value)}
              onBlur={() => {
                const next = Number(capacityInput);
                if (Number.isFinite(next) && next !== tripSafe.capacity) {
                  void patchTrip({ capacity: next });
                }
              }}
              disabled={locked}
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-800">Last day to sign up</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              type="date"
              value={cutoffDateInput}
              onChange={(e) => setCutoffDateInput(e.target.value)}
              onBlur={() => {
                if (toDateValue(tripSafe.cutoffAt) !== cutoffDateInput) {
                  void patchTrip({ cutoffAt: fromDateValue(cutoffDateInput) });
                }
              }}
            />
          </label>

          <label className="block md:col-span-2">
            <div className="text-sm font-medium text-gray-800">Course</div>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={tripSafe.courseId ?? ""}
              onChange={(e) => onSetCourse(e.target.value || null)}
              disabled={locked}
            >
              <option value="">Select course…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block md:col-span-2">
            <div className="text-sm font-medium text-gray-800">Tee</div>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={tripSafe.teeId ?? ""}
              onChange={(e) => onSetTee(e.target.value || null)}
              disabled={locked || !tripSafe.courseId}
            >
              <option value="">Select tee…</option>
              {tees.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} • {t.meters}m • Par {t.par} • Slope {t.slope}
                </option>
              ))}
            </select>
          </label>
        </div>

          {/* Button to close trip and move to Phase 2 */}
          {cutoffDate && now >= cutoffDate && (
            <div className="mt-4 flex justify-end">
              <button
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                onClick={onCloseTripAndPostLogistics}
              >
                Close RSVP & Post Logistics
              </button>
            </div>
          )}
          {/* Manual close button if cutoff hasn't passed yet */}
          {(!cutoffDate || now < cutoffDate) && (
            <div className="mt-4 flex justify-end">
              <button
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                onClick={onCloseTripAndPostLogistics}
              >
                Close RSVP & Post Logistics
              </button>
            </div>
          )}
        </section>
      )}

      {/* Phase 2 & 3: Logistics - Show after cutoff passes */}
      {(phase2 || phase3 || phase4) && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Phase 2: Logistics</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="text-sm font-medium text-gray-800">Ferry</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={tripSafe.ferry ?? ""}
              onChange={(e) => {
                const next = e.target.value.trim();
                void patchTrip({ ferry: next || undefined });
              }}
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-800">Meet time</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={meetTimeInput}
              onChange={(e) => setMeetTimeInput(e.target.value)}
              onBlur={() => {
                if ((tripSafe.logistics?.meetTime ?? "") !== (meetTimeInput ?? "")) {
                  void onSetLogistics({ ...(tripSafe.logistics ?? {}), meetTime: meetTimeInput || undefined });
                }
              }}
            />
          </label>

          <label className="block md:col-span-2">
            <div className="text-sm font-medium text-gray-800">Meeting point</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={meetingPointInput}
              onChange={(e) => setMeetingPointInput(e.target.value)}
              onBlur={() => {
                if ((tripSafe.logistics?.meetingPoint ?? "") !== (meetingPointInput ?? "")) {
                  void onSetLogistics({ ...(tripSafe.logistics ?? {}), meetingPoint: meetingPointInput || undefined });
                }
              }}
            />
          </label>

          <label className="block md:col-span-2">
            <div className="text-sm font-medium text-gray-800">Ferry details</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={ferryDetailsInput}
              onChange={(e) => setFerryDetailsInput(e.target.value)}
              onBlur={() => {
                if ((tripSafe.logistics?.ferryDetails ?? "") !== (ferryDetailsInput ?? "")) {
                  void onSetLogistics({ ...(tripSafe.logistics ?? {}), ferryDetails: ferryDetailsInput || undefined });
                }
              }}
            />
          </label>

          <label className="block md:col-span-2">
            <div className="text-sm font-medium text-gray-800">Notes</div>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              rows={4}
              value={logisticsNotesInput}
              onChange={(e) => setLogisticsNotesInput(e.target.value)}
              onBlur={() => {
                if ((tripSafe.logistics?.notes ?? "") !== (logisticsNotesInput ?? "")) {
                  void onSetLogistics({ ...(tripSafe.logistics ?? {}), notes: logisticsNotesInput || undefined });
                }
              }}
            />
          </label>
        </div>

        {/* Travel Agent Export Button - Show when trip is locked */}
        {locked && (
          <div className="mt-4 flex justify-end gap-2">
            <button
              className="rounded-lg bg-brand-black px-4 py-2 text-sm font-medium text-white hover:opacity-95"
              onClick={onExportTravelAgentCsv}
            >
              Export for Travel Agent (CSV)
            </button>
          </div>
        )}

        {/* Phase 2 Actions */}
        {phase2 && (
          <div className="mt-4 flex justify-end gap-2">
            <button
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={onReopenTrip}
            >
              Reopen Trip
            </button>
            <button
              className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white hover:opacity-95"
              onClick={onTripCompletedPostResults}
            >
              Trip Completed - Post Results
            </button>
          </div>
        )}
        </section>
      )}

      {/* Phase 3: Results - Only show after trip date has passed */}
      {(phase3 || phase4) && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Phase 3: Results</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block md:col-span-2">
            <div className="text-sm font-medium text-gray-800">
              Leaderboard (one per line: <span className="font-mono">Name,Points</span>)
            </div>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
              rows={6}
              value={leaderboardText}
              onChange={(e) => setLeaderboardText(e.target.value)}
            />
          </label>

          <label className="block md:col-span-2">
            <div className="text-sm font-medium text-gray-800">Notes</div>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              rows={3}
              value={resultNotes}
              onChange={(e) => setResultNotes(e.target.value)}
            />
          </label>

          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white"
              onClick={onPublish}
            >
              {hasResults ? "Update Results" : "Publish Results"}
            </button>
            <button
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              onClick={onClearResult}
            >
              Clear Results
            </button>
            <button
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              onClick={onExportCsv}
            >
              Export CSV
            </button>
          </div>
        </div>
        </section>
      )}
    </main>
  );
}
