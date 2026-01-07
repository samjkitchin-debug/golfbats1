"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { loadCourses, type Course } from "../../../lib/courseActions";
import {
  isTripLocked,
  joinTrip,
  leaveTrip,
  loadTrips,
  setMyHandicapForTrip,
  type Trip,
} from "../../../lib/tripActions";
import { getTripCourseText, formatTripDateLong } from "../../../lib/tripDisplay";
import { ConfirmModal } from "../../../components/ConfirmModal";
import { PromptModal } from "../../../components/PromptModal";

function toTripId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  
  const tripId = useMemo(() => toTripId(params?.id), [params?.id]);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    onCancel: () => {},
  });
  const [promptModal, setPromptModal] = useState<{ isOpen: boolean; title: string; message: string; defaultValue: string; placeholder: string; onConfirm: (value: string) => void; onCancel: () => void }>({
    isOpen: false,
    title: "",
    message: "",
    defaultValue: "",
    placeholder: "",
    onConfirm: () => {},
    onCancel: () => {},
  });

  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const [tripsData, coursesData] = await Promise.all([loadTrips(), loadCourses()]);
        setTrips(tripsData);
        setCourses(coursesData);
      } catch (error) {
        console.warn("Failed to load data:", error);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setCurrentUserId(user.id);
          const { data: memberData } = await supabase
            .from("members")
            .select("display_name,full_name")
            .eq("id", user.id)
            .maybeSingle();
          const name = memberData?.display_name || memberData?.full_name || null;
          setCurrentUserName(name);
        }
      } catch (error) {
        console.warn("Failed to load current user:", error);
      }
    }
    loadCurrentUser();
  }, [supabase]);

  const trip = useMemo(() => {
    if (!tripId) return undefined;
    return trips.find((t) => t.id === tripId);
  }, [trips, tripId]);

  // Phase 0: scheduled (open trip, but signups only open within 30 days of trip date)
  const tripDateUtc = trip ? new Date(trip.date + "T00:00:00Z").getTime() : NaN;
  const signupOpenUtc = Number.isFinite(tripDateUtc)
    ? tripDateUtc - 30 * 24 * 60 * 60 * 1000
    : NaN;
  const signupOpenDateYmd = Number.isFinite(signupOpenUtc)
    ? new Date(signupOpenUtc).toISOString().slice(0, 10)
    : null;
  const isPhase0 =
    !!trip &&
    trip.status === "open" &&
    !trip.result &&
    Number.isFinite(signupOpenUtc) &&
    Date.now() < signupOpenUtc;

  const courseText = useMemo(() => {
    if (!trip) return null;
    return getTripCourseText(trip, courses);
  }, [trip, courses]);

  const myEntry = useMemo(() => {
    if (!trip) return undefined;
    // Prefer matching by memberId (supabase user id); fall back to name match if needed
    if (currentUserId) {
      const byId = trip.attendees.find((a) => a.memberId && a.memberId === currentUserId);
      if (byId) return byId;
    }
    if (currentUserName) {
      return trip.attendees.find((a) => a.name === currentUserName);
    }
    return undefined;
  }, [trip, currentUserId, currentUserName]);

  useEffect(() => {
    if (!trip) return;
    console.log("[TripDetail] debug state:", {
      tripId: trip.id,
      currentUserId,
      currentUserName,
      attendees: trip.attendees,
      myEntry,
    });
  }, [trip, currentUserId, currentUserName, myEntry]);

  const [hcp, setHcp] = useState<string>("");

  useEffect(() => {
    if (!myEntry) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHcp("");
      return;
    }
    const v = myEntry.handicapForTrip;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHcp(v === null || v === undefined ? "" : String(v));
  }, [myEntry]);

  if (!tripId) {
    return (
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-lg font-semibold text-brand-black">Invalid trip</div>
        <Link href="/trips" className="mt-3 inline-block text-sm text-gray-700 hover:text-brand-black">
          ← Back to Trips
        </Link>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-lg font-semibold text-brand-black">Trip not found</div>
        <div className="mt-2 text-sm text-gray-600">This trip id doesn’t exist.</div>
        <Link href="/trips" className="mt-3 inline-block text-sm text-gray-700 hover:text-brand-black">
          ← Back to Trips
        </Link>
      </div>
    );
  }

  // From here down, trip is guaranteed
  const tripIdSafe = trip.id;
  const locked = isTripLocked(trip);
  const joinDisabled = locked || isPhase0;

  async function handleImIn() {
    // Prevent duplicate joins
    if (myEntry) return;

    try {
      console.log("[TripDetail] handleImIn called for tripId:", tripIdSafe);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: memberData } = await supabase
          .from("members")
          .select("full_name,display_name,nationality,declared_handicap")
          .eq("id", user.id)
          .maybeSingle();

        const existingHandicap =
          memberData && typeof memberData.declared_handicap === "number"
            ? memberData.declared_handicap
            : null;

        // Prepare the join action function
        const continueWithHandicap = async (handicapValue: number | null) => {
          try {
            console.log("[TripDetail] continueWithHandicap with value:", handicapValue);
            await supabase
              .from("members")
              .update({
                declared_handicap: handicapValue,
                last_seen: new Date().toISOString(),
                full_name: memberData?.full_name ?? null,
                display_name: memberData?.display_name ?? null,
                nationality: memberData?.nationality ?? null,
              })
              .eq("id", user.id);

            const updated = await joinTrip(trips, tripIdSafe, handicapValue);
            console.log("[TripDetail] joinTrip returned, updating trips state. Joined trip snapshot:", {
              tripId: tripIdSafe,
              trip: updated.find((t) => t.id === tripIdSafe),
            });

            // Fallback: if the refreshed trips do not yet include this attendee,
            // inject the attendee locally to keep the UI in sync with the join.
            setTrips((prev) => {
              const base = updated.length ? updated : prev;
              return base.map((t) => {
                if (t.id !== tripIdSafe) return t;

                const already = t.attendees.find((a) => {
                  if (currentUserId && a.memberId === currentUserId) return true;
                  if (currentUserName && a.name === currentUserName) return true;
                  return false;
                });
                if (already) return t;

                const name =
                  currentUserName ||
                  memberData?.display_name ||
                  memberData?.full_name ||
                  "Unknown";

                return {
                  ...t,
                  attendees: [
                    ...t.attendees,
                    {
                      name,
                      status: "confirmed",
                      joinedAt: Date.now(),
                      handicapForTrip: handicapValue,
                      memberId: currentUserId || undefined,
                    },
                  ],
                };
              });
            });
          } catch (error) {
            console.error("Failed to join trip:", error);
            alert(
              `Failed to join trip: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        };

        if (existingHandicap !== null) {
          // Show confirm modal to ask if they want to edit
          setConfirmModal({
            isOpen: true,
            title: "Edit Handicap?",
            message: `Your current handicap is ${existingHandicap}. Do you want to edit it before joining this trip?`,
            onConfirm: () => {
              setConfirmModal({ ...confirmModal, isOpen: false });
              // Show prompt modal for editing handicap
              setPromptModal({
                isOpen: true,
                title: "Enter Handicap",
                message: "Enter your handicap for this trip (0–36), or leave blank to keep it the same:",
                defaultValue: String(existingHandicap),
                placeholder: "0–36",
                onConfirm: (input: string) => {
                  setPromptModal({ ...promptModal, isOpen: false });
                  const trimmed = input.trim();
                  let handicapValue: number | null = existingHandicap;
                  if (trimmed === "") {
                    handicapValue = existingHandicap;
                  } else {
                    const parsed = Number(trimmed);
                    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 36) {
                      alert("Handicap must be a number between 0 and 36.");
                      return;
                    }
                    handicapValue = parsed;
                  }
                  void continueWithHandicap(handicapValue);
                },
                onCancel: () => {
                  setPromptModal({ ...promptModal, isOpen: false });
                  // Join with existing handicap even if they cancel the prompt
                  void continueWithHandicap(existingHandicap);
                },
              });
            },
            onCancel: () => {
              setConfirmModal({ ...confirmModal, isOpen: false });
              // Use existing handicap without editing
              void continueWithHandicap(existingHandicap);
            },
          });
        } else {
          // Show prompt modal for new handicap
          setPromptModal({
            isOpen: true,
            title: "Enter Handicap",
            message: "Please enter your current handicap (0–36), or leave blank if you are not sure yet:",
            defaultValue: "",
            placeholder: "0–36",
            onConfirm: (input: string) => {
              setPromptModal({ ...promptModal, isOpen: false });
              const trimmed = input.trim();
              let handicapValue: number | null = null;
              if (trimmed !== "") {
                const parsed = Number(trimmed);
                if (!Number.isFinite(parsed) || parsed < 0 || parsed > 36) {
                  alert("Handicap must be a number between 0 and 36.");
                  return;
                }
                handicapValue = parsed;
              }
              void continueWithHandicap(handicapValue);
            },
            onCancel: () => {
              setPromptModal({ ...promptModal, isOpen: false });
              // Join without handicap
              void continueWithHandicap(null);
            },
          });
        }

      }
    } catch (error) {
      console.error("Failed to update member handicap:", error);
      alert(
        `Failed to join trip: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async function handleImOut() {
    setConfirmModal({
      isOpen: true,
      title: "Leave Trip?",
      message: "Are you sure you want to leave this trip?",
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, isOpen: false });
        try {
          const updated = await leaveTrip(trips, tripIdSafe);
          setTrips(updated);
        } catch (error) {
          console.error("Failed to leave trip:", error);
          alert(`Failed to leave trip: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, isOpen: false });
      },
    });
  }

  async function saveHandicap() {
    if (!myEntry) return;

    const trimmed = hcp.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);

    if (trimmed !== "" && !Number.isFinite(parsed)) return;

    try {
      const updated = await setMyHandicapForTrip(trips, tripIdSafe, trimmed === "" ? null : parsed);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to save handicap:", error);
      alert(`Failed to save handicap: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const confirmed = trip.attendees
    .filter((a) => a.status === "confirmed")
    .sort((a, b) => a.joinedAt - b.joinedAt);

  const waitlist = trip.attendees
    .filter((a) => a.status === "waitlist")
    .sort((a, b) => a.joinedAt - b.joinedAt);

  return (
    <div className="space-y-4 pb-24">
      <div>
        <Link href="/trips" className="text-sm text-gray-700 hover:text-brand-black">
          ← Back to Trips
        </Link>

        <div className="mt-2 text-xl font-semibold text-brand-black">{courseText?.title ?? "Trip"}</div>
        {courseText?.detail ? <div className="mt-1 text-sm text-gray-600">{courseText.detail}</div> : null}

        <div className="mt-2 text-sm text-gray-700">
          {formatTripDateLong(trip.date)} · {trip.format}
          {trip.ferry ? ` · Ferry ${trip.ferry}` : ""}
          {locked ? " · Locked" : ""}
          {isPhase0 && signupOpenDateYmd ? ` · Signups open ${signupOpenDateYmd}` : ""}
        </div>

        {isPhase0 && (
          <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 p-3">
            <div className="text-sm text-blue-900">
              <span className="font-semibold">Scheduled trip</span> — Date and course shown for planning. Signups will open 30 days before the trip date.
            </div>
          </div>
        )}
      </div>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-medium text-gray-600">RSVP</div>

        <div className="flex gap-2">
          {myEntry ? (
            // User is already in the trip - show disabled "I'm in" and enabled "I'm out"
            <>
              <button
                onClick={handleImIn}
                disabled={true}
                className="flex-1 rounded bg-green-600 py-2 text-sm text-white cursor-default"
              >
                Join Trip
              </button>
              <button
                onClick={handleImOut}
                disabled={locked}
                className={`flex-1 rounded py-2 text-sm text-white ${
                  locked ? "bg-gray-400" : "bg-red-600 hover:opacity-95"
                }`}
              >
                I'm Out
              </button>
            </>
          ) : (
            // User is not in the trip - show only "Join Trip" button in black
            <button
              onClick={handleImIn}
              disabled={joinDisabled}
              className={`flex-1 rounded py-2 text-sm text-white ${
                joinDisabled ? "bg-gray-200 text-gray-500" : "bg-black hover:opacity-95"
              }`}
            >
              Join Trip
            </button>
          )}
        </div>

        {isPhase0 && signupOpenDateYmd ? (
          <div className="mt-3 text-sm text-gray-600">
            Signups open on <span className="font-semibold">{signupOpenDateYmd}</span> (30 days before the trip).
          </div>
        ) : null}

        <div className="mt-3 text-sm text-gray-700">
          Your status:{" "}
          <span className="font-semibold">
            {myEntry?.status === "confirmed"
              ? "Confirmed"
              : myEntry?.status === "waitlist"
              ? "Waitlist"
              : "Not in"}
          </span>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-medium text-gray-600">Handicap snapshot</div>

        {!myEntry ? (
          <div className="text-sm text-gray-600">RSVP first to save a handicap snapshot for this trip.</div>
        ) : (
          <div className="flex gap-2">
            <input
              value={hcp}
              onChange={(e) => setHcp(e.target.value)}
              placeholder="e.g. 12.4"
              className="w-full rounded-md border px-3 py-2 text-sm"
              inputMode="decimal"
            />
            <button
              onClick={saveHandicap}
              className="rounded-md bg-brand-black px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              Save
            </button>
          </div>
        )}

        <div className="mt-2 text-xs text-gray-500">Stored on your attendee record for this trip.</div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-medium text-gray-600">Logistics</div>

        {trip.logistics ? (
          <div className="space-y-2 text-sm text-gray-700">
            {trip.logistics.meetingPoint ? (
              <div>
                <div className="text-xs text-gray-500">Meeting point</div>
                <div>{trip.logistics.meetingPoint}</div>
              </div>
            ) : null}

            {trip.logistics.meetTime ? (
              <div>
                <div className="text-xs text-gray-500">Meet time</div>
                <div>{trip.logistics.meetTime}</div>
              </div>
            ) : null}

            {trip.logistics.ferryDetails ? (
              <div>
                <div className="text-xs text-gray-500">Ferry</div>
                <div className="whitespace-pre-wrap">{trip.logistics.ferryDetails}</div>
              </div>
            ) : null}

            {trip.logistics.notes ? (
              <div>
                <div className="text-xs text-gray-500">Notes</div>
                <div className="whitespace-pre-wrap">{trip.logistics.notes}</div>
              </div>
            ) : null}

            {!trip.logistics.meetingPoint &&
            !trip.logistics.meetTime &&
            !trip.logistics.ferryDetails &&
            !trip.logistics.notes ? (
              <div className="text-sm text-gray-600">No logistics posted yet.</div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-gray-600">No logistics posted yet.</div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-medium text-gray-600">Attendees</div>

        <div className="text-sm text-gray-700">
          <span className="font-semibold">{confirmed.length}</span> confirmed
          {waitlist.length ? (
            <>
              {" "}
              · <span className="font-semibold">{waitlist.length}</span> waitlist
            </>
          ) : null}
        </div>

        <div className="mt-3 grid gap-2">
          {confirmed.map((a, idx) => (
            <div key={a.name} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>
                {idx + 1}. {a.name}
              </span>
              <span className="text-xs text-gray-500">
                {a.handicapForTrip !== undefined && a.handicapForTrip !== null ? `HCP ${a.handicapForTrip}` : ""}
              </span>
            </div>
          ))}

          {waitlist.length ? <div className="pt-2 text-sm font-medium text-gray-600">Waitlist</div> : null}

          {waitlist.map((a, idx) => (
            <div key={a.name} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>
                {idx + 1}. {a.name}
              </span>
              <span className="text-xs text-gray-500">
                {a.handicapForTrip !== undefined && a.handicapForTrip !== null ? `HCP ${a.handicapForTrip}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-2 text-sm font-medium text-gray-600">Results</div>

        {trip.result ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-gray-700">Published</div>
            <Link
              href={`/results/${tripIdSafe}`}
              className="rounded-md border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              View Results →
            </Link>
          </div>
        ) : (
          <div className="text-sm text-gray-600">Not published yet.</div>
        )}
      </section>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={confirmModal.onConfirm}
        onCancel={confirmModal.onCancel}
      />

      <PromptModal
        isOpen={promptModal.isOpen}
        title={promptModal.title}
        message={promptModal.message}
        defaultValue={promptModal.defaultValue}
        placeholder={promptModal.placeholder}
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={promptModal.onConfirm}
        onCancel={promptModal.onCancel}
      />
    </div>
  );
}
