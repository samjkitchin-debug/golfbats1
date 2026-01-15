"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import MemberProfileCard from "../components/MemberProfileCard";

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

  // Helper to check if a PostgREST error has meaningful properties
  const isMeaningfulError = (err: any) =>
    !!(err && (err.message || err.code || err.hint || err.details));

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [approvedGroups, setApprovedGroups] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null); // Can be "all" or a group ID
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load user's approved groups first
  useEffect(() => {
    async function loadGroups() {
      try {
        const res = await fetch("/api/me/bootstrap", { credentials: "include" });
        if (res.ok) {
          const bootstrap = await res.json();
          const groups = bootstrap.approvedGroups || [];
          setApprovedGroups(groups);
          
          // Set default selected group: use localStorage if available, then activeGroupId, then first group
          if (groups.length > 0) {
            const savedGroupId = typeof window !== "undefined" 
              ? localStorage.getItem("dayforeit:members:last_group")
              : null;
            
            // Check if saved group ID is still valid
            const isValidSavedGroup = savedGroupId && (
              savedGroupId === "all" || groups.some((g: { id: string }) => g.id === savedGroupId)
            );
            
            const defaultGroupId = isValidSavedGroup 
              ? savedGroupId 
              : (bootstrap.activeGroupId || groups[0].id);
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
  const loadMembers = async () => {
    setLoading(true);
    setLoadError(null);
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

          // Only treat as error if it has meaningful properties
          if (isMeaningfulError(groupMembersError)) {
            console.error("Failed to load group members:", groupMembersError);
            setLoadError("Couldn't load members.");
            setMembers([]);
            setLoading(false);
            return;
          } else if (groupMembersError) {
            // Ignore empty {} "errors" that occasionally appear under turbopack / serialization
            console.warn("Ignoring empty group_members error object");
          }

          // If no data, treat as empty (not an error)
          if (groupMembersData === null || groupMembersData === undefined) {
            setMembers([]);
            setLoading(false);
            return;
          }

          // Empty array is valid - just means no members in these groups
          if (groupMembersData.length === 0) {
            setMembers([]);
            setLoading(false);
            return;
          }

          // Get unique user IDs (a user might belong to multiple groups)
          const uniqueUserIds = new Set<string>();
          groupMembersData.forEach((gm) => {
            if (gm.user_id) {
              uniqueUserIds.add(gm.user_id);
            }
          });
          userIds = Array.from(uniqueUserIds);
        } else {
          // Load members from selected group only
          const { data: groupMembersData, error: groupMembersError } = await supabase
            .from("group_members")
            .select("user_id")
            .eq("group_id", selectedGroupId)
            .eq("status", "approved");

          // Only treat as error if it has meaningful properties
          if (isMeaningfulError(groupMembersError)) {
            console.error("Failed to load group members:", groupMembersError);
            setLoadError("Couldn't load members.");
            setMembers([]);
            setLoading(false);
            return;
          } else if (groupMembersError) {
            // Ignore empty {} "errors" that occasionally appear under turbopack / serialization
            console.warn("Ignoring empty group_members error object");
          }

          // If no data, treat as empty (not an error)
          if (groupMembersData === null || groupMembersData === undefined) {
            setMembers([]);
            setLoading(false);
            return;
          }

          // Empty array is valid - just means no members in this group
          if (groupMembersData.length === 0) {
            setMembers([]);
            setLoading(false);
            return;
          }

          userIds = groupMembersData.map((gm) => gm.user_id).filter(Boolean);
        }

        // Fetch member details for all user IDs
        if (userIds.length === 0) {
          setMembers([]);
          setLoading(false);
          return;
        }

        // Fetch member details
        const { data: membersData, error: membersError } = await supabase
          .from("members")
          .select("id,email,full_name,display_name,nationality,declared_handicap,profile_photo_path,created_at,last_seen")
          .in("id", userIds)
          .order("full_name", { ascending: true, nullsFirst: false });

        if (isMeaningfulError(membersError)) {
          console.error("Failed to load members:", membersError);
          setLoadError("Couldn't load members.");
          setMembers([]);
        } else {
          if (membersError) console.warn("Ignoring empty members error object");
          // Proceed with data even if there's an empty error object
          setMembers(membersData || []);
        }
    } catch (error) {
      // Only set empty if the core query failed
      console.error("Error loading members (core query failed):", error);
      setLoadError("Couldn't load members.");
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loadingGroups || !selectedGroupId) {
      setLoading(true);
      return;
    }
    loadMembers();
  }, [supabase, selectedGroupId, loadingGroups, approvedGroups]);

  // Filter members by search query
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) {
      return members;
    }

    const query = searchQuery.toLowerCase().trim();
    return members.filter((m) => {
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
  }, [members, searchQuery]);

  return (
    <div className="pb-24">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-foreground">Members</h1>
        <p className="mt-1 text-xs text-muted">Everyone in this group</p>
      </div>
      
      <div className="mb-4">
        <Link
          href="/join?from=/members"
          className="text-sm text-muted hover:text-foreground underline"
        >
          Join a group
        </Link>
      </div>
      
      <div className="mb-4 flex items-center justify-between gap-3">
        {/* Group Selector - Dropdown */}
        {(approvedGroups.length > 0) && (
          <select
            value={selectedGroupId || ""}
            onChange={(e) => {
              const value = e.target.value;
              const groupId = value === "all" ? "all" : value;
              setSelectedGroupId(groupId);
              setSearchQuery(""); // Clear search when switching groups
              // Persist to localStorage
              if (typeof window !== "undefined") {
                localStorage.setItem("dayforeit:members:last_group", groupId);
              }
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

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search members…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-border"
        />
      </div>

      {/* Error message with retry */}
      {loadError && !loading && (
        <div className="mb-4 rounded-lg border border-border bg-surface px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-muted">{loadError}</p>
          <button
            onClick={() => loadMembers()}
            className="text-xs text-secondary hover:text-foreground underline"
          >
            Retry
          </button>
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
      ) : filteredMembers.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">
            {searchQuery.trim() ? "No matches." : "No members yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredMembers.map((member) => {
            const displayName = member.display_name || member.full_name || "—";
            const handicap = member.declared_handicap;
            const photoUrl = member.profile_photo_path
              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${member.profile_photo_path}`
              : null;
            const flag = getFlagForNationality(member.nationality);

            return (
              <div
                key={member.id}
                onClick={() => setSelectedMember(member)}
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

      {/* Member Profile Card Overlay */}
      <MemberProfileCard
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
      />
    </div>
  );
}
