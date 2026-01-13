"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { loadCourseLookup, type CourseLookup } from "../../lib/courseActions";
import { createTrip } from "../../lib/tripActions";

type MemberLite = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  profile_photo_path: string | null;
};

type GroupRow = {
  id: string;
  name: string;
  slug: string;
};

export default function HostPage() {
  const router = useRouter();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [approvedGroups, setApprovedGroups] = useState<GroupRow[]>([]);
  const [isProfileComplete, setIsProfileComplete] = useState<boolean | null>(null);
  const [courses, setCourses] = useState<CourseLookup[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<"who" | "mode" | "planning" | "social" | "confirm">("who");
  
  // Step 1: WHO (multi-select)
  const [whoSelections, setWhoSelections] = useState<Set<"just_me" | "with_mates" | "open_to_groups">>(new Set());
  
  // Step 2: MODE
  const [playMode, setPlayMode] = useState<"playing_now" | "planning_ahead" | null>(null);
  
  // Step 3B: Planning ahead - When & where
  const [tripDate, setTripDate] = useState("");
  const [tripTime, setTripTime] = useState("Now");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  
  // Step 4: Social details - Mates
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [recommendedMates, setRecommendedMates] = useState<MemberLite[]>([]);
  const [searchResults, setSearchResults] = useState<MemberLite[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  
  // Step 4: Social details - Groups
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  
  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [createdTripId, setCreatedTripId] = useState<number | null>(null);

  // Refs for date/time inputs
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  useEffect(() => {
    document.title = "DayForeIt - Host a round";
  }, []);

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

  // Load recommended mates when entering social step
  useEffect(() => {
    if (currentStep !== "social" || !whoSelections.has("with_mates")) {
      setRecommendedMates([]);
      setSearchResults([]);
      return;
    }

    async function loadRecommendedMates() {
      try {
        const res = await fetch("/api/me/mates", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            setRecommendedMates(data.recommended || []);
            // Pre-populate search results if there's a query
            if (searchQuery.trim()) {
              setSearchResults(data.results || []);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load recommended mates:", error);
      }
    }
    loadRecommendedMates();
  }, [currentStep, whoSelections, searchQuery]);

  // Search mates when query changes (debounced)
  useEffect(() => {
    if (!searchQuery.trim() || currentStep !== "social" || !whoSelections.has("with_mates")) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/me/mates?query=${encodeURIComponent(searchQuery)}&limit=50`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            setSearchResults(data.results || []);
          }
        }
      } catch (error) {
        console.error("Failed to search mates:", error);
      } finally {
        setSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery, currentStep, whoSelections]);

  function toggleWho(option: "just_me" | "with_mates" | "open_to_groups") {
    setWhoSelections((prev) => {
      const next = new Set(prev);
      if (option === "just_me") {
        // Just me is exclusive
        if (next.has("just_me")) {
          return next; // Already selected, do nothing
        }
        return new Set(["just_me"]);
      } else {
        // With mates and open to groups can coexist
        if (next.has("just_me")) {
          next.delete("just_me");
        }
        if (next.has(option)) {
          next.delete(option);
        } else {
          next.add(option);
        }
        // If nothing selected, default to just_me
        if (next.size === 0) {
          return new Set(["just_me"]);
        }
        return next;
      }
    });
    // Auto-advance to Step 2 (MODE) after selection
    setCurrentStep("mode");
  }

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

  async function handlePlayingNow() {
    if (!activeGroupId) {
      alert("No active group found. Please refresh and try again.");
      return;
    }

    setSubmitting(true);

    try {
      const today = new Date().toISOString().slice(0, 10);
      const tripName = "Playing now";

      const result = await createTrip([], activeGroupId, {
        name: tripName,
        date: today,
        format: "Stableford",
        status: "open",
        courseId: null, // Allowed for playing now
        teeId: null,
        capacity: 4,
        tripOrigin: "member",
        isPostedToGroup: whoSelections.has("open_to_groups"),
        scenarioKey: null,
        logistics: undefined,
      });

      if (result.newTripId) {
        // Route to GameDay
        router.push(`/gameday/${result.newTripId}`);
      } else {
        throw new Error("Round created but no ID returned");
      }
    } catch (error) {
      console.error("Failed to create round:", error);
      alert(`Failed to create round: ${error instanceof Error ? error.message : String(error)}`);
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (!activeGroupId) {
      alert("No active group found. Please refresh and try again.");
      return;
    }

    if (!tripDate) {
      alert("Please select a date.");
      return;
    }

    if (!selectedCourseId) {
      alert("Please select a course.");
      return;
    }

    setSubmitting(true);

    try {
      const tripName = generateDefaultName();
      // Posting: if "open_to_groups" checked OR specific groups selected
      const isPostedToGroup = whoSelections.has("open_to_groups") || selectedGroupIds.length > 0;
      const finalCapacity = 4; // Default capacity

      const result = await createTrip([], activeGroupId, {
        name: tripName,
        date: tripDate,
        format: "Stableford",
        status: "open",
        courseId: selectedCourseId,
        teeId: null,
        capacity: finalCapacity,
        tripOrigin: "member",
        isPostedToGroup: selectedGroupIds.length > 0 || isPostedToGroup, // Post if groups selected OR open_to_groups checked
        scenarioKey: null,
        logistics: undefined,
      });

      if (result.newTripId) {
        // Invite selected mates (add them as confirmed attendees)
        // Invites occupy slots - capacity logic handled by invite API
        if (selectedMemberIds.length > 0) {
          try {
            // Invite each member using invite endpoint
            await Promise.all(
              selectedMemberIds.map((memberId) =>
                fetch(`/api/trips/${result.newTripId}/invite`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ memberId }),
                }).catch((err) => {
                  console.warn(`Failed to invite member ${memberId}:`, err);
                  // Continue even if some invites fail
                })
              )
            );
          } catch (error) {
            console.error("Failed to invite some members:", error);
            // Continue to confirmation even if invites fail
          }
        }

        setCreatedTripId(result.newTripId);
        setCurrentStep("confirm");
      } else {
        throw new Error("Round created but no ID returned");
      }
    } catch (error) {
      console.error("Failed to create round:", error);
      alert(`Failed to create round: ${error instanceof Error ? error.message : String(error)}`);
      setSubmitting(false);
    }
  }

  function toggleMember(memberId: string) {
    setSelectedMemberIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  }

  function removeMember(memberId: string) {
    setSelectedMemberIds((prev) => prev.filter((id) => id !== memberId));
  }

  function getMemberDisplayName(member: MemberLite): string {
    return member.display_name || member.full_name || "Unknown";
  }

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  }

  // Get members to display (recommended if no search, search results if searching)
  const displayMembers = useMemo(() => {
    if (searchQuery.trim()) {
      return searchResults;
    }
    return recommendedMates;
  }, [searchQuery, searchResults, recommendedMates]);

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

  // Step 1: WHO (first, always)
  if (currentStep === "who") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Host a round</h1>
          <p className="mt-2 text-sm text-muted">Who are you playing with?</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => toggleWho("just_me")}
            className="w-full rounded-lg bg-white p-4 text-left shadow-sm active:scale-[0.985] active:shadow-none transition-all"
          >
            <div className="font-medium text-foreground">🧍 Just me</div>
          </button>

          <button
            onClick={() => toggleWho("with_mates")}
            className="w-full rounded-lg bg-white p-4 text-left shadow-sm active:scale-[0.985] active:shadow-none transition-all"
          >
            <div className="font-medium text-foreground">👥 With mates</div>
          </button>

          <button
            onClick={() => toggleWho("open_to_groups")}
            className="w-full rounded-lg bg-white p-4 text-left shadow-sm active:scale-[0.985] active:shadow-none transition-all"
          >
            <div className="font-medium text-foreground">🌍 Open to groups</div>
          </button>
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

  // Step 2: MODE OF PLAY
  if (currentStep === "mode") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">When are you playing?</h1>
        </div>

        <div className="space-y-3">
          <button
            onClick={handlePlayingNow}
            disabled={submitting}
            className="w-full rounded-lg bg-white p-4 text-left shadow-sm active:scale-[0.985] active:shadow-none transition-all disabled:opacity-50"
          >
            <div className="font-medium text-foreground">▶️ Playing now</div>
            {submitting && <div className="mt-1 text-sm text-muted">Creating round…</div>}
          </button>

          <button
            onClick={() => {
              setPlayMode("planning_ahead");
              setCurrentStep("planning");
            }}
            className="w-full rounded-lg bg-white p-4 text-left shadow-sm active:scale-[0.985] active:shadow-none transition-all"
          >
            <div className="font-medium text-foreground">🗓️ Planning ahead</div>
          </button>
        </div>

        <div className="mt-6">
          <button
            onClick={() => {
              setCurrentStep("who");
              setWhoSelections(new Set());
            }}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // Step 3B: PLANNING AHEAD - When & where (combined)
  if (currentStep === "planning") {
    // Generate date options (next 60 days)
    const generateDateOptions = () => {
      const options: Array<{ value: string; label: string; weekday: string; date: string }> = [];
      const today = new Date();
      
      for (let i = 0; i < 60; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dateStr = date.toISOString().split("T")[0];
        const weekday = date.toLocaleDateString("en-GB", { weekday: "long" });
        const dateShort = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        
        let label = "";
        if (i === 0) {
          label = "Today";
        } else if (i === 1) {
          label = "Tomorrow";
        } else if (i <= 7) {
          label = `This ${weekday}`;
        } else {
          label = dateShort;
        }
        
        options.push({ value: dateStr, label, weekday, date: dateShort });
      }
      
      return options;
    };

    // Generate time options (15-minute increments from 6:00 AM to 7:30 PM)
    const generateTimeOptions = () => {
      const options: Array<{ value: string; label: string }> = [];
      
      // If in "playing_now" mode, add "Now" as first option
      if (playMode === "playing_now") {
        options.push({ value: "Now", label: "Now" });
      }
      
      // Generate times in 15-minute increments
      for (let hour = 6; hour < 20; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
          const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
          const ampm = hour >= 12 ? "PM" : "AM";
          const hour12 = hour % 12 || 12;
          const label = `${hour12}:${minute.toString().padStart(2, "0")} ${ampm}`;
          options.push({ value: timeStr, label });
        }
      }
      
      return options;
    };

    const dateOptions = generateDateOptions();
    const timeOptions = generateTimeOptions();

    // Find selected indices (default to first option if not set)
    const selectedDateIndex = tripDate
      ? Math.max(0, dateOptions.findIndex((opt) => opt.value === tripDate))
      : 0;
    const selectedTimeIndex = tripTime
      ? Math.max(0, timeOptions.findIndex((opt) => opt.value === tripTime))
      : playMode === "playing_now" ? 0 : Math.max(0, timeOptions.findIndex((opt) => opt.value === "07:00"));

    // Handle date selection from scroll
    const handleDateScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const container = e.currentTarget;
      const scrollTop = container.scrollTop;
      const itemHeight = 56;
      const selectedIndex = Math.round(scrollTop / itemHeight);
      if (dateOptions[selectedIndex] && dateOptions[selectedIndex].value !== tripDate) {
        setTripDate(dateOptions[selectedIndex].value);
      }
    };

    // Handle time selection from scroll
    const handleTimeScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const container = e.currentTarget;
      const scrollTop = container.scrollTop;
      const itemHeight = 56;
      const selectedIndex = Math.round(scrollTop / itemHeight);
      if (timeOptions[selectedIndex] && timeOptions[selectedIndex].value !== tripTime) {
        setTripTime(timeOptions[selectedIndex].value);
      }
    };

    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">When & where</h1>
        </div>

        <div className="space-y-6">
          {/* Date wheel instrument */}
          <div>
            <div className="text-xs text-muted mb-2">Date</div>
            <div className="relative rounded-lg bg-white shadow-sm overflow-hidden">
              {/* Fade overlays */}
              <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none" />
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-white z-10 pointer-events-none" />
              
              {/* Selection indicator */}
              <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-14 border-t border-b border-border/20 z-0" />
              
              {/* Scrollable date list */}
              <div
                className="relative overflow-y-auto"
                style={{
                  height: "200px",
                  scrollSnapType: "y mandatory",
                }}
                onScroll={handleDateScroll}
              >
                <div style={{ height: "72px" }} /> {/* Top padding for centering */}
                {dateOptions.map((option, index) => (
                  <div
                    key={option.value}
                    style={{
                      height: "56px",
                      scrollSnapAlign: "center",
                    }}
                    className={`flex flex-col justify-center px-4 transition-colors ${
                      index === selectedDateIndex ? "bg-brand-green/5 font-medium" : ""
                    }`}
                  >
                    <div className="text-base font-medium text-foreground">
                      {option.weekday}
                    </div>
                    <div className="text-xs text-muted">{option.label}</div>
                  </div>
                ))}
                <div style={{ height: "72px" }} /> {/* Bottom padding for centering */}
              </div>
            </div>
          </div>

          {/* Time wheel instrument */}
          <div>
            <div className="text-xs text-muted mb-2">Time</div>
            <div className="relative rounded-lg bg-white shadow-sm overflow-hidden">
              {/* Fade overlays */}
              <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none" />
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-white z-10 pointer-events-none" />
              
              {/* Selection indicator */}
              <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-14 border-t border-b border-border/20 z-0" />
              
              {/* Scrollable time list */}
              <div
                className="relative overflow-y-auto"
                style={{
                  height: "200px",
                  scrollSnapType: "y mandatory",
                }}
                onScroll={handleTimeScroll}
              >
                <div style={{ height: "72px" }} /> {/* Top padding for centering */}
                {timeOptions.map((option, index) => (
                  <div
                    key={option.value}
                    style={{
                      height: "56px",
                      scrollSnapAlign: "center",
                    }}
                    className={`flex items-center justify-center px-4 transition-colors ${
                      index === selectedTimeIndex ? "bg-brand-green/5 font-medium" : ""
                    }`}
                  >
                    <div className="text-base font-medium text-foreground">
                      {option.label}
                    </div>
                  </div>
                ))}
                <div style={{ height: "72px" }} /> {/* Bottom padding for centering */}
              </div>
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

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => {
              setCurrentStep("mode");
              setPlayMode(null);
            }}
            className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            Back
          </button>
          <button
            onClick={() => {
              // Check if we need social details step
              if (whoSelections.has("with_mates") || whoSelections.has("open_to_groups")) {
                setCurrentStep("social");
              } else {
                handleSubmit();
              }
            }}
            disabled={!tripDate || !selectedCourseId || submitting}
            className="flex-1 rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
          >
            {submitting ? "Creating…" : "Host round"}
          </button>
        </div>
      </div>
    );
  }

  // Step 4: SOCIAL DETAILS (conditional)
  if (currentStep === "social") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Add details</h1>
        </div>

        <div className="space-y-6">
          {/* Add mates section */}
          {whoSelections.has("with_mates") && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                Add mates
              </label>

              {/* Selected mates chips */}
              {selectedMemberIds.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedMemberIds.map((memberId) => {
                    // Find member in recommended or search results
                    const member = [...recommendedMates, ...searchResults].find((m) => m.id === memberId);
                    if (!member) return null;
                    return (
                      <div
                        key={memberId}
                        className="inline-flex items-center gap-2 rounded-full border border-brand-green bg-brand-green/10 px-3 py-1 text-sm"
                      >
                        <span className="text-foreground">{getMemberDisplayName(member)}</span>
                        <button
                          onClick={() => removeMember(memberId)}
                          className="text-brand-green hover:text-brand-green/80"
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Search */}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search mates..."
                className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-foreground mb-3"
              />

              {/* Recommended section (shown when no search query) */}
              {!searchQuery.trim() && recommendedMates.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
                    Recommended
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recommendedMates.map((member) => {
                      const isSelected = selectedMemberIds.includes(member.id);
                      if (isSelected) return null; // Don't show selected members in recommended
                      return (
                        <button
                          key={member.id}
                          onClick={() => toggleMember(member.id)}
                          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors"
                          type="button"
                        >
                          {getMemberDisplayName(member)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Search results */}
              {searchQuery.trim() && (
                <div>
                  <div className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
                    {searching ? "Searching..." : "Results"}
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto border border-border rounded-lg p-3 bg-surface">
                    {searchResults.length === 0 ? (
                      <p className="text-sm text-muted">
                        {searching ? "Searching..." : "No mates found"}
                      </p>
                    ) : (
                      searchResults.map((member) => {
                        const isSelected = selectedMemberIds.includes(member.id);
                        if (isSelected) return null; // Don't show selected members in results
                        return (
                          <button
                            key={member.id}
                            onClick={() => toggleMember(member.id)}
                            className="w-full rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:bg-muted/50"
                            type="button"
                          >
                            <div className="text-sm font-medium text-foreground">
                              {getMemberDisplayName(member)}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Post to groups section */}
          {whoSelections.has("open_to_groups") && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                Post to groups
              </label>
              <p className="text-xs text-muted mb-3">
                Select groups to advertise this round. Invites occupy slots; posting advertises remaining spots.
              </p>
              <div className="space-y-2">
                {approvedGroups.map((group) => {
                  const isSelected = selectedGroupIds.includes(group.id);
                  return (
                    <button
                      key={group.id}
                      onClick={() => toggleGroup(group.id)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        isSelected
                          ? "border-brand-green bg-brand-green/10"
                          : "border-border bg-surface hover:bg-muted/50"
                      }`}
                      type="button"
                    >
                      <div className="text-sm font-medium text-foreground">{group.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setCurrentStep("planning")}
            className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating…" : "Host round"}
          </button>
        </div>
      </div>
    );
  }

  // Step 5: CONFIRMATION (shown after successful creation)
  if (currentStep === "confirm" && createdTripId) {
    // Detect spare slots: capacity is 4, host + selectedMemberIds.length
    const totalPlayers = 1 + selectedMemberIds.length; // host + invited mates
    const capacity = 4;
    const hasSpareSlot = totalPlayers < capacity;

    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Round hosted</h1>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
          <div className="text-sm text-muted">
            Your round is ready. Share it with your mates or start playing.
          </div>

          {hasSpareSlot && (
            <div className="rounded-lg border border-border bg-surface/50 p-4 space-y-2">
              <div className="text-sm font-medium text-foreground">Got a spare spot?</div>
              <div className="text-xs text-muted">
                Share the invite link in the group chat so someone can join.
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Link
              href={`/trips/${createdTripId}`}
              className="flex-1 rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-90 text-center"
            >
              View round
            </Link>
            {whoSelections.has("with_mates") && (
              <button
                onClick={() => {
                  const inviteLink = `${window.location.origin}/trips/${createdTripId}?invite=1`;
                  navigator.clipboard.writeText(inviteLink);
                  alert("Invite link copied!");
                }}
                className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
              >
                Copy invite link
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
