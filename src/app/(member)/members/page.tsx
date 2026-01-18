"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatHandicap } from "@/app/lib/format";
import { useSearchParams, useRouter } from "next/navigation";
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const adminMode = searchParams?.get("mode") === "admin";
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
  const [approvedGroups, setApprovedGroups] = useState<Array<{ id: string; name: string; slug: string; role?: string }>>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null); // Can be "all" or a group ID
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Array<{ userId: string; status: string; role: string }>>([]);
  const [pendingMembers, setPendingMembers] = useState<MemberRow[]>([]);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<{ userId: string; action: string } | null>(null);
  const [removeMemberModal, setRemoveMemberModal] = useState<{ isOpen: boolean; member: MemberRow | null }>({
    isOpen: false,
    member: null,
  });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [membershipActionError, setMembershipActionError] = useState<string | null>(null);

  // Load user's approved groups first
  useEffect(() => {
    async function loadGroups() {
      try {
        const res = await fetch("/api/me/bootstrap", { credentials: "include" });
        if (res.ok) {
          const bootstrap = await res.json();
          setCurrentUserId(bootstrap.userId || null);
          const groups = (bootstrap.approvedGroups || []).map((g: any) => ({
            id: g.id,
            name: g.name,
            slug: g.slug,
            role: g.role,
          }));
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
          // Load members from selected group only - include both approved and pending
          const { data: groupMembersData, error: groupMembersError } = await supabase
            .from("group_members")
            .select("user_id, status, role")
            .eq("group_id", selectedGroupId)
            .in("status", ["approved", "pending"]);

          // Only treat as error if it has meaningful properties
          if (isMeaningfulError(groupMembersError)) {
            console.error("Failed to load group members:", groupMembersError);
            setLoadError("Couldn't load members.");
            setMembers([]);
            setPendingMembers([]);
            setMemberships([]);
            setLoading(false);
            return;
          } else if (groupMembersError) {
            // Ignore empty {} "errors" that occasionally appear under turbopack / serialization
            console.warn("Ignoring empty group_members error object");
          }

          // Store memberships
          const membershipData = (groupMembersData || []).map((gm: any) => ({
            userId: gm.user_id,
            status: gm.status,
            role: gm.role || "member",
          }));
          setMemberships(membershipData);

          // Separate approved and pending user IDs
          const approvedUserIds = (groupMembersData || [])
            .filter((gm: any) => gm.status === "approved")
            .map((gm: any) => gm.user_id)
            .filter(Boolean);
          const pendingUserIds = (groupMembersData || [])
            .filter((gm: any) => gm.status === "pending")
            .map((gm: any) => gm.user_id)
            .filter(Boolean);

          // Start with approved members
          userIds = approvedUserIds;

          // If there are pending members and we're an admin in adminMode, load their details too
          if (pendingUserIds.length > 0 && adminMode) {
            const selectedGroup = approvedGroups.find((g) => g.id === selectedGroupId);
            if (selectedGroup?.role === "admin") {
              // Load pending member details
              const { data: pendingMembersData } = await supabase
                .from("members")
                .select("id,email,full_name,display_name,nationality,declared_handicap,profile_photo_path,created_at,last_seen")
                .in("id", pendingUserIds);

              setPendingMembers(pendingMembersData || []);
            } else {
              setPendingMembers([]);
            }
          } else {
            setPendingMembers([]);
          }
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

  // Check if user is admin of selected group
  const isAdminOfSelectedGroup = useMemo(() => {
    if (selectedGroupId === "all" || !selectedGroupId) return false;
    const selectedGroup = approvedGroups.find((g) => g.id === selectedGroupId);
    return selectedGroup?.role === "admin";
  }, [selectedGroupId, approvedGroups]);

  // Handle membership actions
  const handleMembershipAction = async (userId: string, action: "approve" | "reject" | "setRole" | "remove", role?: "admin" | "member") => {
    if (!selectedGroupId || selectedGroupId === "all") return;

    setProcessingAction({ userId, action });
    setMembershipActionError(null);

    try {
      const res = await fetch("/api/groups/memberships", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId: selectedGroupId, userId, action, role }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMembershipActionError(json.error || "Failed to update membership");
        setProcessingAction(null);
        return;
      }

      // Close remove modal if action was remove
      if (action === "remove") {
        setRemoveMemberModal({ isOpen: false, member: null });
      }

      // Reload members after action
      await loadMembers();
    } catch (error) {
      console.error("Failed to update membership:", error);
      setMembershipActionError("Failed to update membership. Please try again.");
    } finally {
      setProcessingAction(null);
    }
  };

  return (
    <div className="pb-24">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-foreground">Members</h1>
        <p className="mt-1 text-xs text-muted">Everyone in this group</p>
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
              setPendingMembers([]); // Clear pending when switching
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
        {isAdminOfSelectedGroup && selectedGroupId !== "all" && (
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-foreground">Admin mode</span>
            <div className="relative inline-block h-6 w-10 focus-within:ring-2 focus-within:ring-anticipation/40 focus-within:rounded-full">
              <input
                type="checkbox"
                checked={adminMode}
                onChange={(e) => {
                  if (e.target.checked) {
                    router.push("/members?mode=admin");
                  } else {
                    router.push("/members");
                  }
                }}
                className="sr-only peer focus-visible:outline-none"
              />
              <span
                className={`absolute inset-0 rounded-full transition-colors border ${
                  adminMode 
                    ? "bg-anticipation/30 border-anticipation" 
                    : "bg-surface-2 border-border"
                }`}
              />
              <span
                className={`absolute left-[1px] top-[1px] h-5 w-5 rounded-full transition-transform ${
                  adminMode 
                    ? "bg-anticipation translate-x-4" 
                    : "bg-surface translate-x-0"
                }`}
              />
            </div>
          </label>
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

      {/* Membership action error */}
      {membershipActionError && (
        <div className="mb-4 rounded-lg border border-border bg-danger/10 px-4 py-3 text-sm text-danger" aria-live="polite">
          {membershipActionError}
        </div>
      )}

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

      {/* Admin Tools View Gate */}
      {adminMode && !isAdminOfSelectedGroup && selectedGroupId !== "all" && (
        <div className="mb-4 rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-sm text-muted">
            You don't have access to admin tools for this group.
          </p>
        </div>
      )}

      {/* Admin Tools: Pending Section */}
      {adminMode && isAdminOfSelectedGroup && selectedGroupId !== "all" && pendingMembers.length > 0 && (
        <div className="mb-6">
          <div className="mb-3">
            <h2 className="text-sm font-medium text-foreground">Pending</h2>
            <p className="mt-1 text-xs text-muted">Approve or reject membership requests</p>
          </div>
          <div className="space-y-2">
            {pendingMembers.map((member) => {
              const displayName = member.display_name || member.full_name || member.email || "—";
              const photoUrl = member.profile_photo_path
                ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${member.profile_photo_path}`
                : null;
              const isProcessing = processingAction?.userId === member.id;

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt={displayName}
                        className="h-10 w-10 flex-shrink-0 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="h-10 w-10 flex-shrink-0 rounded-full bg-background border border-border flex items-center justify-center text-xs font-medium text-muted">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {displayName}
                      </div>
                      {member.email && (
                        <div className="text-xs text-muted truncate">{member.email}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleMembershipAction(member.id, "approve")}
                      disabled={isProcessing}
                      className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleMembershipAction(member.id, "reject")}
                      disabled={isProcessing}
                      className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
              <button
                key={member.id}
                type="button"
                onClick={() => setSelectedMember(member)}
                className="w-full flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-left cursor-pointer hover:bg-surface/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-anticipation/40"
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

                {/* Right: Handicap chip + Chevron */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {handicap !== null && handicap !== undefined ? (
                    <div className="member-chip flex flex-col items-center justify-center">
                      <span className="text-[10px] font-medium text-secondary uppercase tracking-wide leading-tight">
                        HCP
                      </span>
                      <span className="text-sm font-semibold text-primary leading-tight">
                        {formatHandicap(handicap)}
                      </span>
                    </div>
                  ) : null}
                  <span className="text-muted" aria-hidden="true">›</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Member Profile Card Overlay */}
      <MemberProfileCard
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
        adminMode={adminMode}
        isAdminOfSelectedGroup={isAdminOfSelectedGroup}
        selectedGroupId={selectedGroupId}
        memberships={memberships}
        changingRole={changingRole}
        processingAction={processingAction}
        currentUserId={currentUserId}
        onSetRole={(userId: string, role: "admin" | "member") => {
          setChangingRole(userId);
          handleMembershipAction(userId, "setRole", role).finally(() => {
            setChangingRole(null);
          });
        }}
        onRemoveMember={(member: MemberRow) => {
          setRemoveMemberModal({ isOpen: true, member });
        }}
      />

      {/* Remove Member Confirmation Modal */}
      {removeMemberModal.isOpen && removeMemberModal.member && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface border border-border p-6">
            <h3 className="mb-2 text-lg font-semibold text-foreground">Remove member?</h3>
            <p className="mb-4 text-sm text-muted">
              They'll lose access to this group. You can invite them again later.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRemoveMemberModal({ isOpen: false, member: null })}
                disabled={processingAction?.userId === removeMemberModal.member.id}
                className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={() => handleMembershipAction(removeMemberModal.member!.id, "remove")}
                disabled={processingAction?.userId === removeMemberModal.member.id}
                className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingAction?.userId === removeMemberModal.member.id ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
