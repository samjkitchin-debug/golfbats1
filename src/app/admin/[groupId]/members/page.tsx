"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";

type MemberRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  nationality: string | null;
  declared_handicap: number | null;
  group_status: "pending" | "approved";
  group_role: "admin" | "member";
};

export default function AdminMembersPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params?.groupId;

  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [segment, setSegment] = useState<"requests" | "roles">("requests");
  const [processingMemberId, setProcessingMemberId] = useState<string | null>(null);
  const [segmentInitialized, setSegmentInitialized] = useState(false);
  const [groupSlug, setGroupSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;

    async function loadGroupSlug() {
      const { data: groupData } = await supabase
        .from("groups")
        .select("slug")
        .eq("id", groupId)
        .maybeSingle();
      
      if (groupData) {
        setGroupSlug(groupData.slug);
      }
    }

    loadGroupSlug();
  }, [groupId, supabase]);

  useEffect(() => {
    if (!groupId) return;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Fetch group_members for this group
        const { data: groupMembersData, error: groupMembersError } = await supabase
          .from("group_members")
          .select("user_id, role, status")
          .eq("group_id", groupId);

        if (groupMembersError) {
          setError(groupMembersError.message);
          setLoading(false);
          return;
        }

        if (!groupMembersData || groupMembersData.length === 0) {
          setMembers([]);
          setLoading(false);
          return;
        }

        // Extract user_ids and fetch member details
        const userIds = groupMembersData.map((gm) => gm.user_id);
        const { data: membersData, error: membersError } = await supabase
          .from("members")
          .select("id, email, full_name, display_name, nationality, declared_handicap")
          .in("id", userIds);

        if (membersError) {
          setError(membersError.message);
          setLoading(false);
          return;
        }

        // Combine group_members and members data
        const membersMap = new Map((membersData || []).map((m: any) => [m.id, m]));
        const memberRows: MemberRow[] = groupMembersData
          .map((gm: any) => {
            const member = membersMap.get(gm.user_id);
            if (!member) return null;

            return {
              id: member.id,
              email: member.email,
              full_name: member.full_name,
              display_name: member.display_name,
              nationality: member.nationality,
              declared_handicap: member.declared_handicap,
              group_status: (gm.status || "pending") as "pending" | "approved",
              group_role: (gm.role || "member") as "admin" | "member",
            };
          })
          .filter((m): m is MemberRow => m !== null);

        // Sort alphabetically by name
        const sorted = memberRows.sort((a, b) => {
          const aName = (a.display_name || a.full_name || "").toLowerCase();
          const bName = (b.display_name || b.full_name || "").toLowerCase();
          return aName.localeCompare(bName);
        });

        setMembers(sorted);
      } catch (err: unknown) {
        console.error("Error loading members:", err);
        if (err instanceof Error) {
          setError(err.message);
        }
      }

      setLoading(false);
    }

    load();
  }, [supabase, groupId]);

  // Set default segment to requests if there are pending members (only on initial load)
  useEffect(() => {
    if (!segmentInitialized && !loading) {
      const pendingCount = members.filter((m) => m.group_status === "pending").length;
      if (pendingCount > 0) {
        setSegment("requests");
      } else {
        setSegment("roles");
      }
      setSegmentInitialized(true);
    }
  }, [loading, members, segmentInitialized]);

  // Helper function to reload members list
  const reloadMembers = useCallback(async () => {
    if (!groupId) return;

    const { data: groupMembersData, error: groupMembersError } = await supabase
      .from("group_members")
      .select("user_id, role, status")
      .eq("group_id", groupId);

    if (groupMembersError) {
      setError(groupMembersError.message);
      return;
    }

    if (!groupMembersData || groupMembersData.length === 0) {
      setMembers([]);
      return;
    }

    const userIds = groupMembersData.map((gm) => gm.user_id);
    const { data: membersData, error: membersError } = await supabase
      .from("members")
      .select("id, email, full_name, display_name, nationality, declared_handicap")
      .in("id", userIds);

    if (membersError) {
      setError(membersError.message);
      return;
    }

    const membersMap = new Map((membersData || []).map((m: any) => [m.id, m]));
    const memberRows: MemberRow[] = groupMembersData
      .map((gm: any) => {
        const member = membersMap.get(gm.user_id);
        if (!member) return null;
        return {
          id: member.id,
          email: member.email,
          full_name: member.full_name,
          display_name: member.display_name,
          nationality: member.nationality,
          declared_handicap: member.declared_handicap,
          group_status: (gm.status || "pending") as "pending" | "approved",
          group_role: (gm.role || "member") as "admin" | "member",
        };
      })
      .filter((m): m is MemberRow => m !== null);

    const sorted = memberRows.sort((a, b) => {
      const aName = (a.display_name || a.full_name || "").toLowerCase();
      const bName = (b.display_name || b.full_name || "").toLowerCase();
      return aName.localeCompare(bName);
    });

    setMembers(sorted);
  }, [groupId, supabase]);

  // Filter members based on search query and segment
  const filteredMembers = useMemo(() => {
    let filtered = members;
    
    // Apply segment filter
    if (segment === "requests") {
      filtered = filtered.filter((m) => m.group_status === "pending");
    } else if (segment === "roles") {
      filtered = filtered.filter((m) => m.group_status === "approved");
    }
    
    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((m) => {
        const name = (m.display_name || m.full_name || "").toLowerCase();
        const email = (m.email || "").toLowerCase();
        const nationality = (m.nationality || "").toLowerCase();
        const handicap = m.declared_handicap?.toString() || "";
        
        return (
          name.includes(query) ||
          email.includes(query) ||
          nationality.includes(query) ||
          handicap.includes(query)
        );
      });
    }
    
    return filtered;
  }, [members, searchQuery, segment]);

  const handleApproveMember = useCallback(async (memberId: string) => {
    setProcessingMemberId(memberId);
    setError(null);

    try {
      const res = await fetch(`/admin/${groupId}/members/${memberId}/approve`, {
        method: "POST",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to approve member.");
      }

      await reloadMembers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to approve member.");
    } finally {
      setProcessingMemberId(null);
    }
  }, [groupId, reloadMembers]);

  const handleRejectMember = useCallback(async (memberId: string) => {
    setProcessingMemberId(memberId);
    setError(null);

    try {
      const res = await fetch(`/admin/${groupId}/members/${memberId}/reject`, {
        method: "POST",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to reject member.");
      }

      await reloadMembers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to reject member.");
    } finally {
      setProcessingMemberId(null);
    }
  }, [groupId, reloadMembers]);

  const handleMakeAdmin = useCallback(async (memberId: string) => {
    setProcessingMemberId(memberId);
    setError(null);

    try {
      const res = await fetch(`/admin/${groupId}/members/${memberId}/make-admin`, {
        method: "POST",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to make member admin.");
      }

      await reloadMembers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to make member admin.");
    } finally {
      setProcessingMemberId(null);
    }
  }, [groupId, reloadMembers]);

  const handleRemoveAdmin = useCallback(async (memberId: string) => {
    setProcessingMemberId(memberId);
    setError(null);

    try {
      const res = await fetch(`/admin/${groupId}/members/${memberId}/remove-admin`, {
        method: "POST",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to remove admin status.");
      }

      await reloadMembers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove admin status.");
    } finally {
      setProcessingMemberId(null);
    }
  }, [groupId, reloadMembers]);

  const pendingMembers = members.filter((m) => m.group_status === "pending");

  return (
    <main className="mx-auto w-full max-w-md px-5 pt-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Admin</h1>
        <p className="text-sm text-secondary mt-1">Join requests and roles</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-border bg-surface/50 px-4 py-3">
          <p className="text-sm text-foreground">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-secondary">Loading…</div>
      ) : (
        <>
          {/* Two-segment toggle */}
          <div className="mb-6 flex gap-2 rounded-lg border border-border bg-surface p-1">
            <button
              onClick={() => setSegment("requests")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                segment === "requests"
                  ? "bg-background text-foreground"
                  : "text-secondary hover:text-foreground"
              }`}
            >
              Requests
              {pendingMembers.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted/20 px-1.5 py-0.5 text-xs text-secondary">
                  {pendingMembers.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setSegment("roles")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                segment === "roles"
                  ? "bg-background text-foreground"
                  : "text-secondary hover:text-foreground"
              }`}
            >
              Roles
            </button>
          </div>

          {/* Search (optional, only if helpful) */}
          {filteredMembers.length > 5 && (
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search members…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-border"
              />
            </div>
          )}

          {/* Content */}
          {segment === "requests" ? (
            /* Requests view */
            filteredMembers.length === 0 ? (
              <div className="text-sm text-secondary">No join requests right now.</div>
            ) : (
              <div className="space-y-3">
                {filteredMembers.map((m) => {
                  const name = m.display_name || m.full_name || "—";
                  const isProcessing = processingMemberId === m.id;

                  return (
                    <div
                      key={m.id}
                      className="rounded-lg border border-border bg-surface px-4 py-3 space-y-3"
                    >
                      <div>
                        <div className="text-base font-medium text-foreground">{name}</div>
                        {m.email && (
                          <div className="text-xs text-secondary mt-0.5">{m.email}</div>
                        )}
                        {m.declared_handicap !== null && m.declared_handicap !== undefined && (
                          <div className="text-xs text-secondary mt-1">HCP {m.declared_handicap}</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApproveMember(m.id)}
                          disabled={isProcessing}
                          className="flex-1 rounded-lg btn-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessing ? "Processing…" : "Approve"}
                        </button>
                        <button
                          onClick={() => handleRejectMember(m.id)}
                          disabled={isProcessing}
                          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* Roles view */
            filteredMembers.length === 0 ? (
              <div className="text-sm text-secondary">No members found.</div>
            ) : (
              <div className="space-y-3">
                {filteredMembers.map((m) => {
                  const name = m.display_name || m.full_name || "—";
                  const isProcessing = processingMemberId === m.id;
                  const isAdmin = m.group_role === "admin";

                  return (
                    <div
                      key={m.id}
                      className="rounded-lg border border-border bg-surface px-4 py-3 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-base font-medium text-foreground">{name}</div>
                          {isAdmin && (
                            <div className="mt-1">
                              <span className="inline-flex items-center rounded-full bg-muted/10 px-2 py-0.5 text-xs font-medium text-secondary border border-border">
                                Admin
                              </span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => isAdmin ? handleRemoveAdmin(m.id) : handleMakeAdmin(m.id)}
                          disabled={isProcessing}
                          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessing
                            ? "Processing…"
                            : isAdmin
                            ? "Remove admin"
                            : "Make admin"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </>
      )}

      {/* Advanced tools link */}
      <div className="mt-8 pt-6 border-t border-border">
        <Link
          href={groupSlug ? `/admin/tools/g/${groupSlug}` : "/admin/tools"}
          className="text-xs text-secondary hover:text-foreground underline"
        >
          Advanced tools
        </Link>
      </div>
    </main>
  );
}
