"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { loadCourseLookup, type CourseLookup } from "../../lib/courseActions";
import { createTrip } from "../../lib/tripActions";
import { todayInSGT } from "../../lib/tripDates";
import { InlineScrollableCalendar } from "../components/InlineScrollableCalendar";

type GroupRow = {
  id: string;
  name: string;
  slug: string;
};

export default function HostPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [approvedGroups, setApprovedGroups] = useState<GroupRow[]>([]);
  const [isGroupAdmin, setIsGroupAdmin] = useState(false);
  const [isProfileComplete, setIsProfileComplete] = useState<boolean | null>(null);
  const [courses, setCourses] = useState<CourseLookup[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<"chooser" | "q1_when_where" | "q2_travel" | "q2_trip_shape" | "q3_organisation" | "q4_meetup" | "q5_duration" | "summary" | "confirm_hosted" | "confirm">("chooser");
  
  // Chooser - intent selection
  const [tripIntent, setTripIntent] = useState<"hosted_round" | "group_trip" | null>(null);
  
  // Q1: When & where
  const [tripDate, setTripDate] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  
  // Q2: Travel (legacy, kept for backward compatibility)
  const [travelType, setTravelType] = useState<"local" | "travel" | null>(null);
  
  // Q2 Trip shape (group trips only)
  const [travelInvolved, setTravelInvolved] = useState<boolean>(false);
  const [travelTypeDetail, setTravelTypeDetail] = useState<"ferry" | "flight" | "coach" | "drive" | "other" | null>(null);
  const [travelScope, setTravelScope] = useState<"domestic" | "international" | null>(null);
  const [bookingApproach, setBookingApproach] = useState<"self" | "centralised" | null>(null);
  const [bookingProviderName, setBookingProviderName] = useState<string>("");
  const [groupMeetup, setGroupMeetup] = useState<boolean>(true);
  
  // Q3: Organisation level
  const [organisationLevel, setOrganisationLevel] = useState<"hosted_round" | "group_trip" | null>(null);
  
  // Q4: Meetup
  const [hasMeetup, setHasMeetup] = useState<boolean | null>(null);
  
  // Q5: Duration (conditional)
  const [isMultiDay, setIsMultiDay] = useState<boolean | null>(null);
  
  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [createdTripId, setCreatedTripId] = useState<number | null>(null);


  useEffect(() => {
    document.title = tripIntent === "group_trip" ? "DayForeIt - Create group trip" : "DayForeIt - Host a round";
  }, [tripIntent]);

  useEffect(() => {
    if (currentStep === "q1_when_where" && !tripDate) {
      setTripDate(todayInSGT());
    }
  }, [currentStep, tripDate]);

  // Reset travel-related fields when travelInvolved is toggled off
  useEffect(() => {
    if (!travelInvolved) {
      setTravelTypeDetail(null);
      setTravelScope(null);
      setBookingApproach(null);
      setBookingProviderName("");
    }
  }, [travelInvolved]);

  // Reset trip shape fields when entering q2_trip_shape
  useEffect(() => {
    if (currentStep === "q2_trip_shape") {
      if (travelInvolved === null || travelInvolved === undefined) {
        setTravelInvolved(false);
      }
      if (groupMeetup === null || groupMeetup === undefined) {
        setGroupMeetup(true);
      }
      if (isMultiDay === null || isMultiDay === undefined) {
        setIsMultiDay(false);
      }
    }
  }, [currentStep]);

  // Bootstrap: load activeGroupId, approvedGroups, profile status
  useEffect(() => {
    async function loadBootstrap() {
      try {
        const res = await fetch("/api/me/bootstrap", { credentials: "include" });
        if (!res.ok) {
          if (res.status === 401) {
            router.replace("/login");
            return;
          }
          throw new Error("Failed to load bootstrap data");
        }
        const bootstrap = await res.json();
        setActiveGroupId(bootstrap.activeGroupId);
        setApprovedGroups(bootstrap.approvedGroups || []);
        setIsProfileComplete(bootstrap.isProfileComplete);
        
        // Check if user is admin in any group
        const hasAdminRole = (bootstrap.approvedGroups || []).some((g: { role?: string }) => g.role === 'admin');
        setIsGroupAdmin(hasAdminRole);
        
        // If mode=group_trip and admin, preselect but still show chooser
        if (searchParams.get("mode") === "group_trip" && hasAdminRole) {
          setTripIntent("group_trip");
        }
        
        // Check profile completion - route to profile if incomplete
        if (bootstrap.isProfileComplete === false) {
          router.push("/me/edit?required=true&returnTo=/host");
          return;
        }
      } catch (error) {
        console.error("Failed to load bootstrap:", error);
      } finally {
        setLoading(false);
      }
    }
    loadBootstrap();
  }, [router]);

  // Load courses (lookup - lightweight for setup flows)
  useEffect(() => {
    async function loadCoursesData() {
      const coursesData = await loadCourseLookup();
      setCourses(coursesData);
    }
    loadCoursesData();
  }, []);



  function getWeekday(dateStr: string): string {
    if (!dateStr) return "";
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-GB", { weekday: "long" });
  }

  // Format date for instrument display
  function formatDateForDisplay(dateStr: string): string {
    if (!dateStr) return "Select date";
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const date = new Date(dateStr + "T00:00:00");
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const diffMs = dateDay.getTime() - today.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "Today";
    }
    
    if (diffDays === 1) {
      return "Tomorrow";
    }

    // Check if within current calendar week (same week, future day)
    const nowWeekStart = new Date(today);
    nowWeekStart.setDate(today.getDate() - today.getDay()); // Sunday of this week
    const nowWeekEnd = new Date(nowWeekStart);
    nowWeekEnd.setDate(nowWeekStart.getDate() + 6); // Saturday of this week

    if (dateDay >= nowWeekStart && dateDay <= nowWeekEnd && diffDays > 0) {
      return `This ${date.toLocaleDateString("en-GB", { weekday: "long" })}`;
    }

    // Otherwise: <DayOfWeek> <D> <Mon>
    return date.toLocaleDateString("en-GB", { 
      weekday: "short",
      day: "numeric",
      month: "short"
    });
  }

  function generateDefaultName(): string {
    if (tripDate) {
      const weekday = getWeekday(tripDate);
      return `${weekday} round`;
    }
    if (selectedCourseId) {
      const course = courses.find((c) => c.id === selectedCourseId);
      if (course) {
        return `${course.name} round`;
      }
    }
    return "Round";
  }

  async function handleCreateGroupTrip() {
    if (!activeGroupId || !tripDate || !selectedCourseId) {
      alert("Please complete all required fields.");
      return;
    }

    setSubmitting(true);

    try {
      const course = courses.find((c) => c.id === selectedCourseId);
      const tripName = course ? `${course.name} trip` : "Group trip";

      const result = await createTrip([], activeGroupId, {
        name: tripName,
        date: tripDate,
        format: "Stableford",
        status: "open",
        courseId: selectedCourseId,
        teeId: null,
        capacity: 16,
        tripOrigin: "group",
        isPostedToGroup: true,
        scenarioKey: null,
        logistics: undefined,
        // Travel fields from Q2 Trip shape
        travelInvolved: travelInvolved,
        travelType: travelTypeDetail,
        travelScope: travelScope,
        bookingApproach: bookingApproach,
        bookingProviderName: bookingApproach === "centralised" ? bookingProviderName : null,
        travelNote: null, // Travel note is edited on Trip Details, not at creation
      });

      if (result.newTripId) {
        // Redirect directly to trip details page for group trips
        router.push(`/trips/${result.newTripId}`);
      } else {
        throw new Error("Trip created but no ID returned");
      }
    } catch (error) {
      console.error("Failed to create group trip:", error);
      alert(`Failed to create trip: ${error instanceof Error ? error.message : String(error)}`);
      setSubmitting(false);
    }
  }

  async function handleCreateHostedRound() {
    if (!activeGroupId || !tripDate || !selectedCourseId) {
      alert("Please complete all required fields.");
      return;
    }

    setSubmitting(true);

    try {
      const tripName = generateDefaultName();

      const result = await createTrip([], activeGroupId, {
        name: tripName,
        date: tripDate,
        format: "Stableford",
        status: "open",
        courseId: selectedCourseId,
        teeId: null,
        capacity: 4,
        tripOrigin: "member",
        isPostedToGroup: true,
        scenarioKey: null,
        logistics: undefined,
      });

      if (result.newTripId) {
        setCreatedTripId(result.newTripId);
        setCurrentStep("confirm");
      } else {
        throw new Error("Round created but no ID returned");
      }
    } catch (error) {
      console.error("Failed to create hosted round:", error);
      alert(`Failed to create round: ${error instanceof Error ? error.message : String(error)}`);
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (!activeGroupId) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">No active group found. Please join a group first.</p>
        </div>
      </div>
    );
  }

  // Step 1: CHOOSER (first, always)
  if (currentStep === "chooser") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">What are you organising?</h1>
        </div>

        <div className="space-y-3">
          {/* Primary option: Hosted round (available to everyone) */}
          <button
            onClick={() => {
              setTripIntent("hosted_round");
              setCurrentStep("q1_when_where");
            }}
            className="w-full rounded-lg border border-border bg-surface p-4 text-left hover:bg-background active:scale-[0.985] transition-all"
          >
            <div className="font-medium text-foreground">Hosted round</div>
            <div className="mt-1 text-sm text-muted">A simple round you're hosting.</div>
          </button>

          {/* Admin capability section */}
          {isGroupAdmin && approvedGroups.length > 0 && (
            <>
              <div className="pt-2">
                <div className="text-xs font-medium text-muted uppercase tracking-wide mb-1">Admin</div>
                <div className="text-xs text-muted mb-3">For organising official group days.</div>
              </div>
              <button
                onClick={() => {
                  setTripIntent("group_trip");
                  setOrganisationLevel("group_trip"); // Preselect for Q3
                  setCurrentStep("q1_when_where");
                }}
                className="w-full rounded-lg border border-border bg-surface p-4 text-left hover:bg-background active:scale-[0.985] transition-all"
              >
                <div className="font-medium text-foreground">Group trip</div>
                <div className="mt-1 text-sm text-muted">An organised event for the whole group.</div>
              </button>
            </>
          )}

          {/* Member view: show disabled group trip option */}
          {!isGroupAdmin && (
            <>
              <div className="pt-2">
                <div className="text-xs font-medium text-muted uppercase tracking-wide mb-1">Admin</div>
                <div className="text-xs text-muted mb-3">For organising official group days.</div>
              </div>
              <div className="w-full rounded-lg border border-border bg-surface/50 p-4 text-left opacity-60">
                <div className="font-medium text-muted">Group trip</div>
                <div className="mt-1 text-sm text-muted">An organised event for the whole group.</div>
              </div>
            </>
          )}
        </div>

        <div className="mt-6">
          <button
            onClick={() => router.back()}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Q1: When & where
  if (currentStep === "q1_when_where") {
    const todaySGT = todayInSGT();
    
    return (
      <div className="container mx-auto max-w-2xl px-4 py-6 pb-24">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-foreground">When & where</h1>
        </div>

        <div className="space-y-4">
          {/* Inline scrollable calendar instrument */}
          <div>
            <div className="text-xs text-muted mb-1.5">Date</div>
            <div className="rounded-lg border border-border bg-surface p-3">
              <InlineScrollableCalendar
                value={tripDate || null}
                onChange={setTripDate}
                todayYYYYMMDD={todaySGT}
              />
            </div>
          </div>

          {/* Course instrument */}
          <div className="relative">
            <div className="absolute top-0 left-0 text-xs text-muted pt-4 pl-4 pointer-events-none">
              Course <span className="text-muted">(required)</span>
            </div>
            <select
              value={selectedCourseId || ""}
              onChange={(e) => setSelectedCourseId(e.target.value || null)}
              className="w-full rounded-lg bg-white shadow-sm active:scale-[0.985] active:shadow-none transition-all cursor-pointer text-base font-medium text-foreground appearance-none border-0 outline-none pt-8 pb-4 px-4"
            >
              <option value="">Select a course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name} {course.location ? `- ${course.location}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sticky action bar */}
        <div className="sticky bottom-0 z-10 bg-surface border-t border-border mt-6 -mx-4 px-4 py-3 pb-4">
          <div className="flex gap-3">
            <button
              onClick={() => {
                setCurrentStep("chooser");
                setTripIntent(null);
              }}
              className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
            >
              Back
            </button>
            <button
              onClick={() => {
                if (tripIntent === "group_trip") {
                  setCurrentStep("q2_trip_shape");
                } else {
                  handleCreateHostedRound();
                }
              }}
              disabled={!tripDate || !selectedCourseId || submitting}
              className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
            >
              {submitting && tripIntent === "hosted_round" ? "Creating…" : tripIntent === "hosted_round" ? "Create hosted round" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Q2: Trip shape (group trips only)
  if (currentStep === "q2_trip_shape") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-6 pb-24">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-foreground">What kind of trip is this?</h1>
        </div>

        <div className="space-y-6">
          {/* Section A: Travel */}
          <div>
            <div className="text-sm font-medium text-foreground mb-3">Travel</div>
            <div className="space-y-2">
              <button
                onClick={() => setTravelInvolved(false)}
                className={`w-full rounded-lg border p-3 text-left transition-all ${
                  !travelInvolved ? "border-foreground/30 bg-muted/20" : "border-border bg-surface hover:bg-background"
                }`}
              >
                <div className="text-sm font-medium text-foreground">Local</div>
              </button>
              <button
                onClick={() => setTravelInvolved(true)}
                className={`w-full rounded-lg border p-3 text-left transition-all ${
                  travelInvolved ? "border-foreground/30 bg-muted/20" : "border-border bg-surface hover:bg-background"
                }`}
              >
                <div className="text-sm font-medium text-foreground">Travel involved</div>
              </button>
            </div>

            {travelInvolved && (
              <div className="mt-4 space-y-4 pl-2 border-l-2 border-border">
                {/* Travel type */}
                <div>
                  <div className="text-xs text-muted mb-2">Travel type</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["ferry", "flight", "coach", "drive", "other"] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setTravelTypeDetail(type)}
                        className={`rounded-lg border p-2 text-sm font-medium transition-all ${
                          travelTypeDetail === type
                            ? "border-foreground/30 bg-muted/20 text-foreground"
                            : "border-border bg-surface text-foreground hover:bg-background"
                        }`}
                      >
                        {type === "coach" ? "Coach / bus" : type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Travel scope */}
                <div>
                  <div className="text-xs text-muted mb-2">Travel scope</div>
                  <div className="space-y-2">
                    {(["domestic", "international"] as const).map((scope) => (
                      <button
                        key={scope}
                        onClick={() => setTravelScope(scope)}
                        className={`w-full rounded-lg border p-2 text-sm font-medium transition-all ${
                          travelScope === scope
                            ? "border-foreground/30 bg-muted/20 text-foreground"
                            : "border-border bg-surface text-foreground hover:bg-background"
                        }`}
                      >
                        {scope.charAt(0).toUpperCase() + scope.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Booking approach */}
                <div>
                  <div className="text-xs text-muted mb-2">Booking approach</div>
                  <div className="space-y-2">
                    <button
                      onClick={() => setBookingApproach("self")}
                      className={`w-full rounded-lg border p-2 text-sm font-medium text-left transition-all ${
                        bookingApproach === "self"
                          ? "border-foreground/30 bg-muted/20 text-foreground"
                          : "border-border bg-surface text-foreground hover:bg-background"
                      }`}
                    >
                      Everyone books their own
                    </button>
                    <button
                      onClick={() => setBookingApproach("centralised")}
                      className={`w-full rounded-lg border p-2 text-sm font-medium text-left transition-all ${
                        bookingApproach === "centralised"
                          ? "border-foreground/30 bg-muted/20 text-foreground"
                          : "border-border bg-surface text-foreground hover:bg-background"
                      }`}
                    >
                      Centralised booking
                    </button>
                  </div>
                </div>

                {/* Booking provider name (optional, shown if centralised) */}
                {bookingApproach === "centralised" && (
                  <div>
                    <div className="text-xs text-muted mb-1">Booked via (optional)</div>
                    <input
                      type="text"
                      value={bookingProviderName}
                      onChange={(e) => setBookingProviderName(e.target.value)}
                      placeholder="Travel agent / concierge name"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/30"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section B: Group meetup */}
          <div>
            <div className="text-sm font-medium text-foreground mb-3">Group meetup</div>
            <button
              onClick={() => setGroupMeetup(!groupMeetup)}
              className={`w-full rounded-lg border p-3 text-left transition-all ${
                groupMeetup ? "border-foreground/30 bg-muted/20" : "border-border bg-surface hover:bg-background"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">Group meetup</div>
                  <div className="text-xs text-muted mt-1">Everyone meets first, then heads off together.</div>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors ${
                  groupMeetup ? "bg-brand-green" : "bg-muted"
                }`}>
                  <div className={`w-5 h-5 rounded-full bg-white mt-0.5 transition-transform ${
                    groupMeetup ? "translate-x-4" : "translate-x-0.5"
                  }`} />
                </div>
              </div>
            </button>
          </div>

          {/* Section C: More than one day */}
          <div>
            <div className="text-sm font-medium text-foreground mb-3">More than one day</div>
            <button
              onClick={() => setIsMultiDay(!isMultiDay)}
              className={`w-full rounded-lg border p-3 text-left transition-all ${
                isMultiDay ? "border-foreground/30 bg-muted/20" : "border-border bg-surface hover:bg-background"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">More than one day</div>
                  <div className="text-xs text-muted mt-1">Trip spans multiple days.</div>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors ${
                  isMultiDay ? "bg-brand-green" : "bg-muted"
                }`}>
                  <div className={`w-5 h-5 rounded-full bg-white mt-0.5 transition-transform ${
                    isMultiDay ? "translate-x-4" : "translate-x-0.5"
                  }`} />
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Sticky action bar */}
        <div className="sticky bottom-0 z-10 bg-surface border-t border-border mt-6 -mx-4 px-4 py-3 pb-4">
          <div className="flex gap-3">
            <button
              onClick={() => setCurrentStep("q1_when_where")}
              className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
            >
              Back
            </button>
            <button
              onClick={() => setCurrentStep("summary")}
              className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Q2: Travel (group trips only) - legacy, kept but unreachable from new flow
  if (currentStep === "q2_travel") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">How are people getting there?</h1>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => {
              setTravelType("local");
              setCurrentStep("q3_organisation");
            }}
            className="w-full rounded-lg border border-border bg-surface p-4 text-left hover:bg-background active:scale-[0.985] transition-all"
          >
            <div className="font-medium text-foreground">Local course</div>
          </button>

          <button
            onClick={() => {
              setTravelType("travel");
              setCurrentStep("q3_organisation");
            }}
            className="w-full rounded-lg border border-border bg-surface p-4 text-left hover:bg-background active:scale-[0.985] transition-all"
          >
            <div className="font-medium text-foreground">Travel involved</div>
          </button>
        </div>

        <div className="mt-6">
          <button
            onClick={() => setCurrentStep("q1_when_where")}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // Q3: Organisation level (group trips only)
  if (currentStep === "q3_organisation") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">How organised is the day?</h1>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => {
              setOrganisationLevel("hosted_round");
              setCurrentStep("q4_meetup");
            }}
            className={`w-full rounded-lg border p-4 text-left hover:bg-background active:scale-[0.985] transition-all ${
              organisationLevel === "hosted_round" ? "border-foreground/20 bg-muted/30" : "border-border bg-surface"
            }`}
          >
            <div className="font-medium text-foreground">Hosted round</div>
            <div className="mt-1 text-sm text-muted">You're organising a simple round. Details stay flexible.</div>
          </button>

          <button
            onClick={() => {
              setOrganisationLevel("group_trip");
              setCurrentStep("q4_meetup");
            }}
            className={`w-full rounded-lg border p-4 text-left hover:bg-background active:scale-[0.985] transition-all ${
              organisationLevel === "group_trip" ? "border-foreground/20 bg-muted/30" : "border-border bg-surface"
            }`}
          >
            <div className="font-medium text-foreground">Group trip</div>
            <div className="mt-1 text-sm text-muted">A planned group event with shared expectations.</div>
          </button>
        </div>

        <div className="mt-6">
          <button
            onClick={() => setCurrentStep("q2_travel")}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // Q4: Meetup (group trips only)
  if (currentStep === "q4_meetup") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Is there a group meetup?</h1>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => {
              setHasMeetup(false);
              if (travelType === "travel") {
                setCurrentStep("q5_duration");
              } else {
                setCurrentStep("summary");
              }
            }}
            className="w-full rounded-lg border border-border bg-surface p-4 text-left hover:bg-background active:scale-[0.985] transition-all"
          >
            <div className="font-medium text-foreground">No fixed meetup</div>
          </button>

          <button
            onClick={() => {
              setHasMeetup(true);
              if (travelType === "travel") {
                setCurrentStep("q5_duration");
              } else {
                setCurrentStep("summary");
              }
            }}
            className="w-full rounded-lg border border-border bg-surface p-4 text-left hover:bg-background active:scale-[0.985] transition-all"
          >
            <div className="font-medium text-foreground">Yes, we'll meet first</div>
          </button>
        </div>

        <div className="mt-6">
          <button
            onClick={() => setCurrentStep("q3_organisation")}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // Q5: Duration (conditional, group trips only)
  if (currentStep === "q5_duration") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Is this more than one day?</h1>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => {
              setIsMultiDay(false);
              setCurrentStep("summary");
            }}
            className="w-full rounded-lg border border-border bg-surface p-4 text-left hover:bg-background active:scale-[0.985] transition-all"
          >
            <div className="font-medium text-foreground">Single day</div>
          </button>

          <button
            onClick={() => {
              setIsMultiDay(true);
              setCurrentStep("summary");
            }}
            className="w-full rounded-lg border border-border bg-surface p-4 text-left hover:bg-background active:scale-[0.985] transition-all"
          >
            <div className="font-medium text-foreground">Multiple days / stay</div>
          </button>
        </div>

        <div className="mt-6">
          <button
            onClick={() => setCurrentStep("q4_meetup")}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // Summary (group trips only)
  if (currentStep === "summary") {
    const course = courses.find((c) => c.id === selectedCourseId);
    const courseName = course?.name || "Selected course";
    const date = tripDate ? new Date(tripDate + "T00:00:00") : null;
    const dateFormatted = date ? date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "";

    // Use new trip shape variables, fallback to old ones for backward compatibility
    const travelInvolvedValue = travelInvolved !== null && travelInvolved !== undefined ? travelInvolved : (travelType === "travel");
    const meetupValue = groupMeetup !== null && groupMeetup !== undefined ? groupMeetup : (hasMeetup ?? false);
    const multiDayValue = isMultiDay ?? false;

    const travelPhrase = travelInvolvedValue ? "with travel involved" : "local course";
    const meetupPhrase = meetupValue ? " and a group meetup" : "";
    const durationPhrase = multiDayValue ? ", over multiple days" : "";

    const orgLevel = organisationLevel === "group_trip" ? "group trip" : "hosted round";

    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Confirm trip</h1>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 space-y-4 mb-6">
          <p className="text-base text-foreground">
            A <strong>{orgLevel}</strong> at <strong>{courseName}</strong> on <strong>{dateFormatted}</strong>, {travelPhrase}{meetupPhrase}{durationPhrase}.
          </p>
          <p className="text-sm text-muted">We'll set this up as a group trip.</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setCurrentStep("q1_when_where")}
            className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            Change details
          </button>
          <button
            onClick={handleCreateGroupTrip}
            disabled={submitting}
            className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
          >
            {submitting ? "Creating…" : "Confirm & create trip"}
          </button>
        </div>
      </div>
    );
  }

  // Confirm hosted round
  if (currentStep === "confirm_hosted") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Ready to post?</h1>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setCurrentStep("q1_when_where")}
            className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            Change details
          </button>
          <button
            onClick={handleCreateHostedRound}
            disabled={submitting}
            className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
          >
            {submitting ? "Creating…" : "Create hosted round"}
          </button>
        </div>
      </div>
    );
  }

  // Confirmation (shown after successful creation)
  if (currentStep === "confirm" && createdTripId) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">{tripIntent === "group_trip" ? "Trip created" : "All set"}</h1>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
          <div className="text-sm text-muted">
            {tripIntent === "group_trip" 
              ? "This trip has been added to the group."
              : "Your round is ready. Share it with your mates or start playing."}
          </div>

          <div className="flex gap-3">
            <Link
              href={`/trips/${createdTripId}`}
              className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 text-center"
            >
              View {tripIntent === "group_trip" ? "trip" : "details"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
