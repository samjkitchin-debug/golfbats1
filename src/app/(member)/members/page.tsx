"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type MemberRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  nationality: string | null;
  declared_handicap: number | null;
  profile_photo_path: string | null;
  created_at: string;
  last_seen: string | null;
};

function getFlagForNationality(nationality: string | null): string | null {
  if (!nationality) return null;
  const n = nationality.toLowerCase();

  if (n.includes("australia")) return "🇦🇺";
  if (n.includes("british") || n === "uk" || n.includes("united kingdom")) return "🇬🇧";
  if (n.includes("english") || n === "england") return "🏴";
  if (n.includes("scotland") || n.includes("scottish")) return "🏴";
  if (n.includes("wales") || n.includes("welsh")) return "🏴";
  if (n.includes("singapore")) return "🇸🇬";
  if (n.includes("ireland") || n.includes("irish")) return "🇮🇪";
  if (n.includes("usa") || n.includes("united states") || n.includes("american")) return "🇺🇸";
  if (n.includes("canada") || n.includes("canadian")) return "🇨🇦";
  if (n.includes("new zealand") || n.includes("kiwi")) return "🇳🇿";

  return null;
}

export default function MembersPage() {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [nationalityFilter, setNationalityFilter] = useState<string>("");
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);

  useEffect(() => {
    async function loadMembers() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("members")
          .select("id,email,full_name,display_name,nationality,declared_handicap,profile_photo_path,created_at,last_seen")
          .order("full_name", { ascending: true, nullsFirst: false });

        if (error) {
          console.error("Failed to load members:", error);
          setMembers([]);
        } else {
          setMembers(data || []);
        }
      } catch (error) {
        console.error("Error loading members:", error);
        setMembers([]);
      } finally {
        setLoading(false);
      }
    }

    loadMembers();
  }, [supabase]);

  // Get unique nationalities for filter
  const uniqueNationalities = useMemo(() => {
    const nationalities = new Set<string>();
    members.forEach((m) => {
      if (m.nationality) {
        nationalities.add(m.nationality);
      }
    });
    return Array.from(nationalities).sort();
  }, [members]);

  // Filter members by search query and nationality
  const filteredMembers = useMemo(() => {
    let filtered = members;

    // Apply nationality filter
    if (nationalityFilter) {
      filtered = filtered.filter((m) => m.nationality === nationalityFilter);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((m) => {
        const fullName = (m.full_name || "").toLowerCase();
        const displayName = (m.display_name || "").toLowerCase();
        const email = (m.email || "").toLowerCase();
        const nationality = (m.nationality || "").toLowerCase();

        return (
          fullName.includes(query) ||
          displayName.includes(query) ||
          email.includes(query) ||
          nationality.includes(query)
        );
      });
    }

    // Apply alphabetical filter if letter is selected
    if (selectedLetter) {
      filtered = filtered.filter((m) => {
        const name = (m.display_name || m.full_name || "").trim();
        if (!name) return false;
        const firstLetter = name.charAt(0).toUpperCase();
        return firstLetter === selectedLetter;
      });
    }

    return filtered;
  }, [members, searchQuery, nationalityFilter, selectedLetter]);

  // Get first letter of each member's name for A-Z navigation
  const membersByLetter = useMemo(() => {
    const byLetter: Record<string, number> = {};
    members.forEach((m) => {
      const name = (m.display_name || m.full_name || "").trim();
      if (name) {
        const firstLetter = name.charAt(0).toUpperCase();
        if (/[A-Z]/.test(firstLetter)) {
          byLetter[firstLetter] = (byLetter[firstLetter] || 0) + 1;
        }
      }
    });
    return byLetter;
  }, [members]);

  // Cap default rendering to 50 members (unless search/filter is active)
  const displayMembers = useMemo(() => {
    const hasActiveFilter = searchQuery.trim() || nationalityFilter || selectedLetter;
    // If any filter is active, show all filtered results
    // Otherwise, cap at 50 for performance
    if (hasActiveFilter) {
      return filteredMembers;
    }
    return filteredMembers.slice(0, 50);
  }, [filteredMembers, searchQuery, nationalityFilter, selectedLetter]);

  // Scroll to first member with selected letter
  useEffect(() => {
    if (selectedLetter) {
      // Wait for DOM to update after filtering, then scroll
      const timeoutId = setTimeout(() => {
        const firstMemberWithLetter = document.querySelector(
          `[data-first-letter="${selectedLetter}"]`
        );
        if (firstMemberWithLetter) {
          firstMemberWithLetter.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 150);
      
      return () => clearTimeout(timeoutId);
    }
  }, [selectedLetter, displayMembers]);

  return (
    <div className="pb-24">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Members</h1>
      </div>

      {/* Search and Filters */}
      <div className="mb-4 space-y-3">
        <input
          type="text"
          placeholder="Search by name, email, or nationality..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedLetter(null); // Clear letter filter when searching
          }}
          className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-foreground"
        />

        {/* Nationality Filter */}
        {uniqueNationalities.length > 0 && (
          <div>
            <select
              value={nationalityFilter}
              onChange={(e) => {
                setNationalityFilter(e.target.value);
                setSelectedLetter(null); // Clear letter filter when filtering by nationality
              }}
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-foreground"
            >
              <option value="">All nationalities</option>
              {uniqueNationalities.map((nat) => (
                <option key={nat} value={nat}>
                  {nat}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* A-Z Jump Control */}
        {!searchQuery.trim() && !nationalityFilter && (
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 26 }, (_, i) => {
              const letter = String.fromCharCode(65 + i); // A-Z
              const count = membersByLetter[letter] || 0;
              const isActive = selectedLetter === letter;
              
              return (
                <button
                  key={letter}
                  onClick={() => {
                    setSelectedLetter(isActive ? null : letter);
                  }}
                  disabled={count === 0}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    isActive
                      ? "bg-foreground text-white border-foreground"
                      : count > 0
                      ? "bg-surface text-foreground border-border hover:bg-background"
                      : "bg-background text-muted border-border cursor-not-allowed"
                  }`}
                  title={count > 0 ? `${count} member${count !== 1 ? "s" : ""}` : "No members"}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Helper text for default rendering */}
      {!loading && !searchQuery.trim() && !nationalityFilter && !selectedLetter && members.length > 50 && (
        <div className="mb-3 text-xs text-muted">
          Showing 50 of {members.length} members — search to find someone
        </div>
      )}

      {/* Members List */}
      {loading ? (
        <div className="text-center py-8 text-sm text-muted">Loading members…</div>
      ) : displayMembers.length === 0 ? (
        <div className="rounded-xl border bg-surface p-6 text-center">
          <p className="text-sm text-muted">
            {searchQuery || nationalityFilter || selectedLetter
              ? "No members found matching your filters."
              : "No members found."}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {displayMembers.map((member) => {
            const displayName = member.display_name || member.full_name || "—";
            const handicap = member.declared_handicap;
            const photoUrl = member.profile_photo_path
              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${member.profile_photo_path}`
              : null;
            const flag = getFlagForNationality(member.nationality);
            
            // Get first letter for A-Z navigation
            const firstLetter = displayName.trim().charAt(0).toUpperCase();
            const isFirstWithLetter = filteredMembers.findIndex(
              (m) => (m.display_name || m.full_name || "").trim().charAt(0).toUpperCase() === firstLetter
            ) === filteredMembers.findIndex((m) => m.id === member.id);

            return (
              <div
                key={member.id}
                data-first-letter={isFirstWithLetter && /[A-Z]/.test(firstLetter) ? firstLetter : undefined}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-2.5"
              >
                {/* Photo + Name + Handicap (primary row) */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={displayName}
                      className="h-12 w-12 flex-shrink-0 rounded-full object-cover border border-border"
                    />
                  ) : (
                    <div className="h-12 w-12 flex-shrink-0 rounded-full bg-background border border-border flex items-center justify-center text-sm font-medium text-muted">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-foreground truncate">
                        {displayName}
                      </div>
                      <div className="text-sm font-semibold text-foreground flex-shrink-0">
                        {handicap !== null && handicap !== undefined ? `HCP ${handicap}` : "TBC"}
                      </div>
                    </div>
                    {/* Nationality (demoted, smaller, muted) */}
                    {member.nationality && (
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted">
                        {flag && <span className="text-xs">{flag}</span>}
                        <span>{member.nationality}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
