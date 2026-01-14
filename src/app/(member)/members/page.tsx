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
  const [selectedFilter, setSelectedFilter] = useState<"all" | "regulars" | "new">("all");
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

  // Filter members by search query and state filter (All / Regulars / New)
  const filteredMembers = useMemo(() => {
    let filtered = [...members];

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

    // Apply semantic filter
    if (selectedFilter === "regulars") {
      filtered = filtered.filter((m) => m.declared_handicap !== null && m.declared_handicap !== undefined);
    } else if (selectedFilter === "new") {
      filtered = filtered.filter((m) => m.declared_handicap === null || m.declared_handicap === undefined);
    }

    // Sort: regulars first, then new; within each, by name
    filtered.sort((a, b) => {
      const aHasHcp = a.declared_handicap !== null && a.declared_handicap !== undefined;
      const bHasHcp = b.declared_handicap !== null && b.declared_handicap !== undefined;

      if (selectedFilter === "all" && aHasHcp !== bHasHcp) {
        return aHasHcp ? -1 : 1;
      }

      const nameA = (a.display_name || a.full_name || "").toLowerCase();
      const nameB = (b.display_name || b.full_name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return filtered;
  }, [members, searchQuery, selectedFilter]);

  // Cap default rendering to 50 members (unless search/filter is active)
  const displayMembers = useMemo(() => {
    const hasActiveFilter = searchQuery.trim() || selectedFilter !== "all";
    // If any filter is active, show all filtered results
    // Otherwise, cap at 50 for performance
    if (hasActiveFilter) {
      return filteredMembers;
    }
    return filteredMembers.slice(0, 50);
  }, [filteredMembers, searchQuery, selectedFilter]);

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
              setSelectedFilter("all"); // Clear filter
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
          placeholder="Search members..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedFilter("all"); // Reset filter when searching
          }}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-border"
        />

        {/* State filters: All / Regulars / New */}
        {!searchQuery.trim() && (
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: "all", label: "All" },
              { key: "regulars", label: "Regulars" },
              { key: "new", label: "New" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSelectedFilter(key as "all" | "regulars" | "new")}
                className={`member-filter ${selectedFilter === key ? "member-filter-active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Helper text for default rendering */}
      {!loading && !searchQuery.trim() && selectedFilter === "all" && members.length > 50 && (
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
            {searchQuery || selectedFilter !== "all"
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
                {/* Left: Photo + Name + Status + Flag */}
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
                    {(member.declared_handicap === null || member.declared_handicap === undefined) && (
                      <div className="mt-0.5 text-xs secondary-text">
                        New member
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Handicap chip */}
                <div className="flex-shrink-0">
                  {handicap !== null && handicap !== undefined ? (
                    <div className="member-chip flex flex-col items-center justify-center">
                      <span className="text-[10px] font-medium text-secondary uppercase tracking-wide leading-tight">
                        HCP
                      </span>
                      <span className="text-sm font-semibold text-primary leading-tight">
                        {handicap}
                      </span>
                    </div>
                  ) : (
                    <div className="member-chip member-chip-muted">
                      —
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
