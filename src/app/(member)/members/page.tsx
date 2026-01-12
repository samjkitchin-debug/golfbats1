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

  if (n.includes("australia") || n.startsWith("au ")) return "🇦🇺";
  if (n.includes("british") || n === "uk" || n.includes("united kingdom")) return "🇬🇧";
  if (n.includes("english") || n === "england") return "🏴";
  if (n.includes("scotland") || n.includes("scottish")) return "🏴";
  if (n.includes("wales") || n.includes("welsh")) return "🏴";
  if (n.includes("singapore")) return "🇸🇬";
  if (n.includes("ireland") || n.includes("irish")) return "🇮🇪";
  if (n.includes("usa") || n.includes("united states") || n.includes("american")) return "🇺🇸";
  if (n.includes("canada") || n.includes("canadian")) return "🇨🇦";
  if (n.includes("new zealand") || n.includes("kiwi")) return "🇳🇿";
  if (n.includes("argentina")) return "🇦🇷";
  if (n.includes("belarus")) return "🇧🇾";

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
  const [selectedLetterRange, setSelectedLetterRange] = useState<string | null>(null);
  const [approvedGroups, setApprovedGroups] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null); // Can be "all" or a group ID
  const [loadingGroups, setLoadingGroups] = useState(true);

  // Load user's approved groups first
  useEffect(() => {
    async function loadGroups() {
      try {
        const res = await fetch("/api/me/bootstrap", { credentials: "include" });
        if (res.ok) {
          const bootstrap = await res.json();
          const groups = bootstrap.approvedGroups || [];
          setApprovedGroups(groups);
          
          // Set default selected group: use activeGroupId if available, otherwise first group
          // Don't auto-select "all" - default to first group
          if (groups.length > 0) {
            const defaultGroupId = bootstrap.activeGroupId || groups[0].id;
            setSelectedGroupId(defaultGroupId);
          }
        }
      } catch (error) {
        console.error("Failed to load groups:", error);
      } finally {
        setLoadingGroups(false);
      }
    }
    loadGroups();
  }, []);

  // Load members for selected group (or all groups if "all" is selected)
  useEffect(() => {
    if (loadingGroups || !selectedGroupId) {
      setLoading(true);
      return;
    }

    async function loadMembers() {
      setLoading(true);
      try {
        let userIds: string[] = [];

        if (selectedGroupId === "all") {
          // Load members from all approved groups
          const groupIds = approvedGroups.map((g) => g.id);
          
          if (groupIds.length === 0) {
            setMembers([]);
            setLoading(false);
            return;
          }

          const { data: groupMembersData, error: groupMembersError } = await supabase
            .from("group_members")
            .select("user_id")
            .in("group_id", groupIds)
            .eq("status", "approved");

          if (groupMembersError) {
            console.error("Failed to load group members:", groupMembersError);
            setMembers([]);
            setLoading(false);
            return;
          }

          // Get unique user IDs (a user might belong to multiple groups)
          userIds = Array.from(new Set((groupMembersData || []).map((gm) => gm.user_id)));
        } else {
          // Load members from selected group only
          const { data: groupMembersData, error: groupMembersError } = await supabase
            .from("group_members")
            .select("user_id")
            .eq("group_id", selectedGroupId)
            .eq("status", "approved");

          if (groupMembersError) {
            console.error("Failed to load group members:", groupMembersError);
            setMembers([]);
            setLoading(false);
            return;
          }

          if (!groupMembersData || groupMembersData.length === 0) {
            setMembers([]);
            setLoading(false);
            return;
          }

          userIds = groupMembersData.map((gm) => gm.user_id);
        }

        // Fetch member details for all user IDs
        if (userIds.length === 0) {
          setMembers([]);
          setLoading(false);
          return;
        }

        const { data: membersData, error: membersError } = await supabase
          .from("members")
          .select("id,email,full_name,display_name,nationality,declared_handicap,profile_photo_path,created_at,last_seen")
          .in("id", userIds)
          .order("full_name", { ascending: true, nullsFirst: false });

        if (membersError) {
          console.error("Failed to load members:", membersError);
          setMembers([]);
        } else {
          setMembers(membersData || []);
        }
      } catch (error) {
        console.error("Error loading members:", error);
        setMembers([]);
      } finally {
        setLoading(false);
      }
    }

    loadMembers();
  }, [supabase, selectedGroupId, loadingGroups, approvedGroups]);

  // Helper to check if a letter is in a range
  function isLetterInRange(letter: string, range: string): boolean {
    if (range === "all") return true;
    const upper = letter.toUpperCase();
    if (range === "a-e") return upper >= "A" && upper <= "E";
    if (range === "f-j") return upper >= "F" && upper <= "J";
    if (range === "k-o") return upper >= "K" && upper <= "O";
    if (range === "p-t") return upper >= "P" && upper <= "T";
    if (range === "u-z") return upper >= "U" && upper <= "Z";
    return false;
  }

  // Filter members by search query and letter range
  const filteredMembers = useMemo(() => {
    let filtered = members;

    // Apply search query (includes nationality matching)
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

    // Apply letter range filter if selected
    if (selectedLetterRange && selectedLetterRange !== "all") {
      filtered = filtered.filter((m) => {
        const name = (m.display_name || m.full_name || "").trim();
        if (!name) return false;
        const firstLetter = name.charAt(0);
        return isLetterInRange(firstLetter, selectedLetterRange);
      });
    }

    return filtered;
  }, [members, searchQuery, selectedLetterRange]);

  // Cap default rendering to 50 members (unless search/filter is active)
  const displayMembers = useMemo(() => {
    const hasActiveFilter = searchQuery.trim() || selectedLetterRange;
    // If any filter is active, show all filtered results
    // Otherwise, cap at 50 for performance
    if (hasActiveFilter) {
      return filteredMembers;
    }
    return filteredMembers.slice(0, 50);
  }, [filteredMembers, searchQuery, selectedLetterRange]);

  const selectedGroup = approvedGroups.find((g) => g.id === selectedGroupId);

  return (
    <div className="pb-24">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Members</h1>
        {/* Group Selector - Dropdown */}
        {(approvedGroups.length > 0) && (
          <select
            value={selectedGroupId || ""}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedGroupId(value === "all" ? "all" : value);
              setSearchQuery(""); // Clear search when switching groups
              setSelectedLetterRange(null); // Clear letter filter
            }}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-foreground"
          >
            {approvedGroups.length > 1 && (
              <option value="all">All groups</option>
            )}
            {approvedGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Search and Filters */}
      <div className="mb-4 space-y-3">
        <input
          type="text"
          placeholder="Search by name, email, or nationality..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedLetterRange(null); // Clear letter filter when searching
          }}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-border"
        />

        {/* Letter Range Navigation - Clustered chips */}
        {!searchQuery.trim() && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => {
                setSelectedLetterRange(selectedLetterRange === "all" ? null : "all");
              }}
              className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                selectedLetterRange === "all"
                  ? "bg-brand-green text-white border-foreground"
                  : "bg-surface text-foreground border-border hover:bg-background"
              }`}
            >
              All
            </button>
            {[
              { range: "a-e", label: "A–E" },
              { range: "f-j", label: "F–J" },
              { range: "k-o", label: "K–O" },
              { range: "p-t", label: "P–T" },
              { range: "u-z", label: "U–Z" },
            ].map(({ range, label }) => (
              <button
                key={range}
                onClick={() => {
                  setSelectedLetterRange(selectedLetterRange === range ? null : range);
                }}
                className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                  selectedLetterRange === range
                    ? "bg-brand-green text-white border-foreground"
                    : "bg-surface text-foreground border-border hover:bg-background"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Helper text for default rendering */}
      {!loading && !searchQuery.trim() && !selectedLetterRange && members.length > 50 && (
        <div className="mb-3 text-xs text-muted">
          Showing 50 of {members.length} members — search to find someone
        </div>
      )}

      {/* Members List */}
      {loadingGroups ? (
        <div className="text-center py-8 text-sm text-muted">Loading…</div>
      ) : approvedGroups.length === 0 ? (
        <div className="rounded-xl border bg-surface p-6 text-center">
          <p className="text-sm text-muted">You're not a member of any groups yet.</p>
        </div>
      ) : loading ? (
        <div className="text-center py-8 text-sm text-muted">Loading members…</div>
      ) : displayMembers.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">
            {searchQuery || selectedLetterRange
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

            return (
              <div
                key={member.id}
                onClick={() => {
                  // Stub for future member detail modal
                }}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 cursor-pointer hover:bg-surface/80 transition-colors"
              >
                {/* Left: Photo + Name + Flag */}
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
                      <div className="text-sm font-medium text-foreground truncate">
                        {displayName}
                      </div>
                      {/* Nationality flag */}
                      {flag && (
                        <span className="text-base flex-shrink-0" role="img" aria-label={member.nationality || "Nationality"}>
                          {flag}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Handicap in a clean circle */}
                <div className="flex-shrink-0">
                  {handicap !== null && handicap !== undefined ? (
                    <div className="h-12 w-12 rounded-full bg-background border-2 border-border flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-[10px] font-medium text-muted uppercase tracking-wide leading-tight">
                          HCP
                        </div>
                        <div className="text-sm font-bold text-foreground leading-tight">
                          {handicap}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-background border-2 border-dashed border-border flex items-center justify-center">
                      <div className="text-[10px] font-medium text-muted uppercase tracking-wide">
                        TBC
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
