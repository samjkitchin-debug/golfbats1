"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { loadCourses, type Course } from "../../lib/courseActions";
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
  const [courses, setCourses] = useState<Course[]>([]);
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

  // Load courses
  useEffect(() => {
    async function loadCoursesData() {
      const coursesData = await loadCourses();
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
            className={`w-full rounded-lg border p-4 text-left transition-colors ${
              whoSelections.has("just_me")
                ? "border-brand-green bg-brand-green/10"
                : "border-border bg-surface hover:bg-muted/50"
            }`}
          >
            <div className="font-medium text-foreground">🧍 Just me</div>
          </button>

          <button
            onClick={() => toggleWho("with_mates")}
            className={`w-full rounded-lg border p-4 text-left transition-colors ${
              whoSelections.has("with_mates")
                ? "border-brand-green bg-brand-green/10"
                : "border-border bg-surface hover:bg-muted/50"
            }`}
          >
            <div className="font-medium text-foreground">👥 With mates</div>
          </button>

          <button
            onClick={() => toggleWho("open_to_groups")}
            className={`w-full rounded-lg border p-4 text-left transition-colors ${
              whoSelections.has("open_to_groups")
                ? "border-brand-green bg-brand-green/10"
                : "border-border bg-surface hover:bg-muted/50"
            }`}
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
            className="w-full rounded-lg border border-brand-green bg-brand-green/10 p-4 text-left transition-colors hover:bg-brand-green/20 disabled:opacity-50"
          >
            <div className="font-medium text-foreground">▶️ Playing now</div>
            {submitting && <div className="mt-1 text-sm text-muted">Creating round…</div>}
          </button>

          <button
            onClick={() => {
              setPlayMode("planning_ahead");
              setCurrentStep("planning");
            }}
            className="w-full rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:bg-muted/50"
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
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">When & where</h1>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Date <span className="text-muted">(required)</span>
            </label>
            <input
              type="date"
              value={tripDate}
              onChange={(e) => setTripDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-foreground"
              min={new Date().toISOString().split("T")[0]}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Time
            </label>
            <input
              type="text"
              value={tripTime}
              onChange={(e) => setTripTime(e.target.value)}
              placeholder="Now"
              className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Course <span className="text-muted">(required)</span>
            </label>
            <select
              value={selectedCourseId || ""}
              onChange={(e) => setSelectedCourseId(e.target.value || null)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-foreground"
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
            className="flex-1 rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Round hosted</h1>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
          <div className="text-sm text-muted">
            Your round is ready. Share it with your mates or start playing.
          </div>

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
