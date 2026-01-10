"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type MemberStatus = "pending" | "active" | string;

type MemberRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  nationality: string | null;
  declared_handicap: number | null;
  created_at: string | null;
  last_seen: string | null;
  status: MemberStatus;
  is_admin: boolean;
};

type PassportStatus = {
  memberId: string;
  hasPassport: boolean;
  isComplete: boolean;
};

type PassportDetails = {
  passport_full_name: string | null;
  passport_number: string | null;
  passport_country: string | null;
  passport_expiry_date: string | null;
  passport_photo_url: string | null;
};

export default function AdminMembersPage() {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [passportStatuses, setPassportStatuses] = useState<Record<string, PassportStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"pending" | "members" | "admins">("members");
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null);
  const [passportDetails, setPassportDetails] = useState<PassportDetails | null>(null);
  const [loadingPassport, setLoadingPassport] = useState(false);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);
  const [approvingMemberId, setApprovingMemberId] = useState<string | null>(null);
  const [editingRolesMember, setEditingRolesMember] = useState<MemberRow | null>(null);
  const [rolesIsAdmin, setRolesIsAdmin] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [openMenuMemberId, setOpenMenuMemberId] = useState<string | null>(null);
  const [pendingDetailsOpen, setPendingDetailsOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [membersResult, passportResult] = await Promise.all([
          supabase
            .from("members")
            .select(
              "id,email,full_name,display_name,nationality,declared_handicap,created_at,last_seen,status,is_admin"
            ),
          fetch("/api/admin/passport-statuses").then(async (res) => {
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(json?.error || "Failed to load passport statuses.");
            }
            return json;
          }),
        ]);

        const { data: rows, error: membersError } = membersResult;

        if (membersError) {
          setError(membersError.message);
        } else {
          // Sort: admins first, then alphabetically by name
          const sorted = (rows ?? []).sort((a, b) => {
            const aIsAdmin = !!a.is_admin;
            const bIsAdmin = !!b.is_admin;
            if (aIsAdmin !== bIsAdmin) {
              return aIsAdmin ? -1 : 1; // Admins first
            }
            const aName = (a.display_name || a.full_name || "").toLowerCase();
            const bName = (b.display_name || b.full_name || "").toLowerCase();
            return aName.localeCompare(bName);
          });

          setMembers(sorted);
        }

        if (passportResult?.statuses) {
          setPassportStatuses(passportResult.statuses as Record<string, PassportStatus>);
        }
      } catch (err: unknown) {
        console.error("Error loading admin members:", err);
        if (err instanceof Error) {
          setError(err.message);
        }
      }

      setLoading(false);
    }

    load();
  }, [supabase]);

  // Calculate summary metrics
  const metrics = useMemo(() => {
    const pending = members.filter((m) => (m.status ?? "pending") !== "active").length;
    const passportMissing = members.filter((m) => {
      const status = passportStatuses[m.id];
      return !status?.hasPassport;
    }).length;
    const inactive = members.filter((m) => {
      const status = passportStatuses[m.id];
      const isActive = (m.status ?? "pending") === "active";
      return isActive && !status?.hasPassport;
    }).length;
    
    return { pending, passportMissing, inactive };
  }, [members, passportStatuses]);

  // Set default tab to Pending if there are pending members (only on initial load)
  const [hasInitialized, setHasInitialized] = useState(false);
  useEffect(() => {
    if (!hasInitialized && !loading) {
      if (metrics.pending > 0) {
        setActiveTab("pending");
      } else {
        setActiveTab("members");
      }
      setHasInitialized(true);
    }
  }, [loading, metrics.pending, hasInitialized]);

  // Filter members based on search query and active tab
  const filteredMembers = useMemo(() => {
    let filtered = members;
    
    // Apply tab filter
    if (activeTab === "pending") {
      filtered = filtered.filter((m) => (m.status ?? "pending") !== "active");
    } else if (activeTab === "admins") {
      filtered = filtered.filter((m) => m.is_admin);
    } else if (activeTab === "members") {
      filtered = filtered.filter((m) => !m.is_admin);
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
  }, [members, searchQuery, activeTab]);

  async function handleViewPassport(memberId: string) {
    setViewingMemberId(memberId);
    setLoadingPassport(true);
    setPassportDetails(null);

    try {
      // Fetch decrypted passport data from server
      const res = await fetch(`/admin/members/${memberId}/passport`, {
        method: "GET",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to fetch passport details.");
      }

      setPassportDetails(json.passport || null);
    } catch (e: any) {
      setError(e?.message || "Failed to load passport details.");
    } finally {
      setLoadingPassport(false);
    }
  }

  function closePassportModal() {
    setViewingMemberId(null);
    setPassportDetails(null);
  }

  async function handleDeleteMember(memberId: string, memberName: string, isReject = false) {
    const message = isReject
      ? `Reject ${memberName}? This will delete their account and all associated data.`
      : `Are you sure you want to delete ${memberName}? This action cannot be undone. All associated data (passport, trip attendees, etc.) will also be deleted.`;
    
    const confirmed = window.confirm(message);

    if (!confirmed) return;

    setDeletingMemberId(memberId);
    setError(null);

    try {
      const res = await fetch(`/admin/members/${memberId}/delete`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to delete member.");
      }

      // Reload members list
      const { data: rows, error: membersError } = await supabase
        .from("members")
        .select("id,email,full_name,display_name,nationality,declared_handicap,created_at,last_seen,status,is_admin");

      if (membersError) {
        setError(membersError.message);
      } else {
        // Sort: admins first, then alphabetically by name
        const sorted = (rows ?? []).sort((a, b) => {
          const aIsAdmin = !!a.is_admin;
          const bIsAdmin = !!b.is_admin;
          if (aIsAdmin !== bIsAdmin) {
            return aIsAdmin ? -1 : 1; // Admins first
          }
          const aName = (a.display_name || a.full_name || "").toLowerCase();
          const bName = (b.display_name || b.full_name || "").toLowerCase();
          return aName.localeCompare(bName);
        });
        setMembers(sorted);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete member.");
    } finally {
      setDeletingMemberId(null);
    }
  }

  async function handleApproveMember(memberId: string, memberName: string) {
    setApprovingMemberId(memberId);
    setError(null);

    try {
      const res = await fetch(`/admin/members/${memberId}/approve`, {
        method: "POST",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to approve member.");
      }

      // Reload members list
      const { data: rows, error: membersError } = await supabase
        .from("members")
        .select("id,email,full_name,display_name,nationality,declared_handicap,created_at,last_seen,status,is_admin");

      if (membersError) {
        setError(membersError.message);
      } else {
        // Sort: admins first, then alphabetically by name
        const sorted = (rows ?? []).sort((a, b) => {
          const aIsAdmin = !!a.is_admin;
          const bIsAdmin = !!b.is_admin;
          if (aIsAdmin !== bIsAdmin) {
            return aIsAdmin ? -1 : 1; // Admins first
          }
          const aName = (a.display_name || a.full_name || "").toLowerCase();
          const bName = (b.display_name || b.full_name || "").toLowerCase();
          return aName.localeCompare(bName);
        });
        setMembers(sorted);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to approve member.");
    } finally {
      setApprovingMemberId(null);
    }
  }

  async function handleMakeAdmin(memberId: string, memberName: string) {
    setError(null);
    try {
      setApprovingMemberId(memberId);
      const res = await fetch(`/admin/members/${memberId}/make-admin`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to make member admin.");
      }

      const { data: rows, error: membersError } = await supabase
        .from("members")
        .select("id,email,full_name,display_name,nationality,declared_handicap,created_at,last_seen,status,is_admin")
        .order("created_at", { ascending: false });

      if (membersError) {
        setError(membersError.message);
      } else {
        setMembers(rows ?? []);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to make member admin.");
    } finally {
      setApprovingMemberId(null);
    }
  }

  async function handleRemoveAdmin(memberId: string, memberName: string) {
    setError(null);
    try {
      setApprovingMemberId(memberId);
      const res = await fetch(`/admin/members/${memberId}/remove-admin`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to remove admin status.");
      }

      const { data: rows, error: membersError } = await supabase
        .from("members")
        .select("id,email,full_name,display_name,nationality,declared_handicap,created_at,last_seen,status,is_admin")
        .order("created_at", { ascending: false });

      if (membersError) {
        setError(membersError.message);
      } else {
        // Sort: admins first, then alphabetically by name
        const sorted = (rows ?? []).sort((a, b) => {
          const aIsAdmin = !!a.is_admin;
          const bIsAdmin = !!b.is_admin;
          if (aIsAdmin !== bIsAdmin) {
            return aIsAdmin ? -1 : 1; // Admins first
          }
          const aName = (a.display_name || a.full_name || "").toLowerCase();
          const bName = (b.display_name || b.full_name || "").toLowerCase();
          return aName.localeCompare(bName);
        });
        setMembers(sorted);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove admin status.");
    } finally {
      setApprovingMemberId(null);
    }
  }

  async function handleSaveRoles() {
    if (!editingRolesMember) return;
    setSavingRoles(true);
    setError(null);

    try {
      const targetId = editingRolesMember.id;
      const targetName = editingRolesMember.display_name || editingRolesMember.full_name || "Member";

      if (rolesIsAdmin && !editingRolesMember.is_admin) {
        // Promote to admin
        const res = await fetch(`/admin/members/${targetId}/make-admin`, { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || "Failed to make member admin.");
        }
      } else if (!rolesIsAdmin && editingRolesMember.is_admin) {
        // Remove admin
        const res = await fetch(`/admin/members/${targetId}/remove-admin`, { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || "Failed to remove admin status.");
        }
      }

      // Reload members list
      const { data: rows, error: membersError } = await supabase
        .from("members")
        .select("id,email,full_name,display_name,nationality,declared_handicap,created_at,last_seen,status,is_admin");

      if (membersError) {
        setError(membersError.message);
      } else {
        const sorted = (rows ?? []).sort((a, b) => {
          const aIsAdmin = !!a.is_admin;
          const bIsAdmin = !!b.is_admin;
          if (aIsAdmin !== bIsAdmin) {
            return aIsAdmin ? -1 : 1;
          }
          const aName = (a.display_name || a.full_name || "").toLowerCase();
          const bName = (b.display_name || b.full_name || "").toLowerCase();
          return aName.localeCompare(bName);
        });
        setMembers(sorted);
      }

      setEditingRolesMember(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save roles.");
    } finally {
      setSavingRoles(false);
    }
  }

  // Click outside handler for overflow menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (openMenuMemberId !== null && !target.closest(`[data-member-menu="${openMenuMemberId}"]`)) {
        setOpenMenuMemberId(null);
      }
    }
    
    if (openMenuMemberId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openMenuMemberId]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-10">
      <div className="mt-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Members</h1>
        <Link href="/admin" className="text-sm text-foreground hover:text-foreground">
          Back to dashboard
        </Link>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4 text-sm text-foreground">
          {error}
        </div>
      ) : loading ? (
        <div className="mt-4 rounded-xl border bg-surface p-4 text-sm text-foreground">
          Loading…
        </div>
      ) : (
        <>
          {/* Summary Metrics (clickable filters) - Responsive grid */}
          <section className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => {
                setActiveTab("pending");
                setSearchQuery("");
              }}
              className={`rounded-xl border p-3 sm:p-4 text-left transition-colors ${
                activeTab === "pending"
                  ? "border-foreground bg-background"
                  : "border-border bg-surface hover:border-border"
              }`}
            >
              <div className="text-xs font-medium text-muted">Pending approvals</div>
              <div className="mt-1 text-xl sm:text-2xl font-semibold text-foreground">{metrics.pending}</div>
            </button>
            <button
              onClick={() => {
                setActiveTab("members");
                setSearchQuery("");
                // Filter by passport missing would need additional logic
              }}
              className="rounded-xl border border-border bg-surface p-3 sm:p-4 text-left hover:border-border transition-colors"
            >
              <div className="text-xs font-medium text-muted">Passport missing</div>
              <div className="mt-1 text-xl sm:text-2xl font-semibold text-foreground">{metrics.passportMissing}</div>
            </button>
            <button
              onClick={() => {
                setActiveTab("members");
                setSearchQuery("");
                // Filter by inactive would need additional logic
              }}
              className="rounded-xl border border-border bg-surface p-3 sm:p-4 text-left hover:border-border transition-colors"
            >
              <div className="text-xs font-medium text-muted">Inactive</div>
              <div className="mt-1 text-xl sm:text-2xl font-semibold text-foreground">{metrics.inactive}</div>
            </button>
          </section>

          {/* Tabs - Responsive */}
          <section className="mt-4 rounded-xl border bg-surface p-1 shadow-sm">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab("pending")}
                className={`flex-1 rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors ${
                  activeTab === "pending"
                    ? "bg-foreground text-white"
                    : "text-foreground hover:bg-background"
                }`}
              >
                Pending
                {metrics.pending > 0 && (
                  <span className={`ml-1.5 sm:ml-2 rounded-full px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs ${
                    activeTab === "pending"
                      ? "bg-surface/20 text-white"
                      : "bg-background text-foreground"
                  }`}>
                    {metrics.pending}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("members")}
                className={`flex-1 rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors ${
                  activeTab === "members"
                    ? "bg-foreground text-white"
                    : "text-foreground hover:bg-background"
                }`}
              >
                Members
              </button>
              <button
                onClick={() => setActiveTab("admins")}
                className={`flex-1 rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors ${
                  activeTab === "admins"
                    ? "bg-foreground text-white"
                    : "text-foreground hover:bg-background"
                }`}
              >
                Admins
              </button>
            </div>
          </section>

          {/* Search Input - Mobile-first, prominent on mobile */}
          <section className="mt-4 rounded-xl border bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-2 sm:gap-3">
              <input
                type="text"
                placeholder="Search by name, email, nationality, or handicap..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 sm:py-2 text-sm focus:border-border focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="rounded-lg border border-border bg-surface px-3 sm:px-4 py-2.5 sm:py-2 text-sm text-foreground hover:bg-background"
                >
                  <span className="hidden sm:inline">Clear search</span>
                  <span className="sm:hidden">Clear</span>
                </button>
              )}
            </div>
          </section>

          {/* Tab Content */}
          <div className="mt-4 rounded-xl border bg-surface">
            {activeTab === "pending" ? (
              /* Pending Tab - Mobile: cards, Desktop: table */
              filteredMembers.length === 0 ? (
                <div className="px-4 py-6 text-sm text-foreground">
                  {searchQuery ? "No pending members match your search." : "No pending approvals."}
                </div>
              ) : (
                <>
                  {/* Mobile: Stacked cards */}
                  <div className="block sm:hidden divide-y">
                    {filteredMembers.map((m) => {
                      const name = m.display_name || m.full_name || "—";
                      const showDetails = pendingDetailsOpen.has(m.id);
                      return (
                        <div key={m.id} className="p-4 space-y-3">
                          <div>
                            <div className="text-base font-semibold text-foreground">{name}</div>
                            {m.declared_handicap !== null && m.declared_handicap !== undefined && (
                              <div className="mt-1 text-sm text-muted">
                                HCP {m.declared_handicap}
                              </div>
                            )}
                          </div>
                          
                          {/* View details toggle */}
                          <button
                            onClick={() => {
                              const newSet = new Set(pendingDetailsOpen);
                              if (showDetails) {
                                newSet.delete(m.id);
                              } else {
                                newSet.add(m.id);
                              }
                              setPendingDetailsOpen(newSet);
                            }}
                            className="text-sm text-muted hover:text-foreground"
                          >
                            {showDetails ? "Hide details" : "View details"}
                          </button>
                          
                          {/* Hidden metadata */}
                          {showDetails && (
                            <div className="space-y-1 text-sm text-muted">
                              {m.email && <div>Email: {m.email}</div>}
                              {m.nationality && <div>Nationality: {m.nationality}</div>}
                              <button
                                onClick={() => handleViewPassport(m.id)}
                                className="text-muted hover:text-foreground"
                              >
                                View passport →
                              </button>
                            </div>
                          )}
                          
                          {/* Primary actions - thumb-safe spacing */}
                          <div className="flex gap-3 pt-2">
                            <button
                              onClick={() => handleApproveMember(m.id, name)}
                              disabled={approvingMemberId === m.id}
                              className="flex-1 rounded-md bg-foreground px-4 py-3 text-sm font-medium text-white hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {approvingMemberId === m.id ? "Approving..." : "Approve"}
                            </button>
                            <button
                              onClick={() => handleDeleteMember(m.id, name, true)}
                              disabled={deletingMemberId === m.id}
                              className="flex-1 rounded-md border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {deletingMemberId === m.id ? "Rejecting..." : "Reject"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Desktop: Compact table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full min-w-[800px] text-left text-sm">
                      <colgroup>
                        <col className="w-[25%]" />
                        <col className="w-[30%]" />
                        <col className="w-[15%]" />
                        <col className="w-[15%]" />
                        <col className="w-[15%]" />
                      </colgroup>
                      <thead className="border-b bg-background">
                        <tr className="text-foreground">
                          <th className="px-4 py-2.5 font-medium">Name</th>
                          <th className="px-4 py-2.5 font-medium">Email</th>
                          <th className="px-4 py-2.5 font-medium">Nationality</th>
                          <th className="px-4 py-2.5 font-medium">HCP</th>
                          <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMembers.map((m) => {
                          const name = m.display_name || m.full_name || "—";
                          return (
                            <tr key={m.id} className="border-b last:border-b-0 hover:bg-background">
                              <td className="px-4 py-2.5 font-medium text-foreground">{name}</td>
                              <td className="px-4 py-2.5 text-foreground">{m.email ?? "—"}</td>
                              <td className="px-4 py-2.5 text-foreground">{m.nationality ?? "—"}</td>
                              <td className="px-4 py-2.5 text-foreground">
                                {m.declared_handicap ?? "—"}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center justify-end gap-2">
                                  <Link
                                    href={`/admin/members/${m.id}/passport`}
                                    className="text-xs text-muted hover:text-foreground"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleViewPassport(m.id);
                                    }}
                                  >
                                    View
                                  </Link>
                                  <button
                                    onClick={() => handleApproveMember(m.id, name)}
                                    disabled={approvingMemberId === m.id}
                                    className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-white hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {approvingMemberId === m.id ? "Approving..." : "Approve"}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteMember(m.id, name, true)}
                                    disabled={deletingMemberId === m.id}
                                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {deletingMemberId === m.id ? "Rejecting..." : "Reject"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            ) : (
              /* Members/Admins Tab - Mobile: cards with overflow menu, Desktop: table */
              filteredMembers.length === 0 ? (
                <div className="px-4 py-6 text-sm text-foreground">
                  {searchQuery
                    ? `No ${activeTab} match your search.`
                    : `No ${activeTab} found.`}
                </div>
              ) : (
                <>
                  {/* Mobile: Compact cards with overflow menu */}
                  <div className="block sm:hidden divide-y">
                    {filteredMembers.map((m) => {
                      const name = m.display_name || m.full_name || "—";
                      const passportStatus = passportStatuses[m.id];
                      const hasCompletePassport = passportStatus?.isComplete ?? false;
                      const hasPassport = passportStatus?.hasPassport ?? false;
                      const isActive = (m.status ?? "pending") === "active";

                      return (
                        <div key={m.id} className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-base font-semibold text-foreground">{name}</div>
                              <div className="mt-1 text-sm text-muted">{m.email ?? "—"}</div>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                {m.declared_handicap !== null && m.declared_handicap !== undefined && (
                                  <span className="text-xs text-muted">HCP {m.declared_handicap}</span>
                                )}
                                {isActive ? (
                                  <span className="inline-flex items-center rounded-full bg-brand-green/10 px-2 py-0.5 text-xs font-medium text-brand-green border border-brand-green/30">
                                    Active
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-surface/50 px-2 py-0.5 text-xs font-medium text-muted border border-border">
                                    Pending
                                  </span>
                                )}
                                {hasCompletePassport ? (
                                  <span className="inline-flex items-center rounded-full bg-brand-green/10 px-2 py-0.5 text-xs font-medium text-brand-green border border-brand-green/30">
                                    Passport
                                  </span>
                                ) : hasPassport ? (
                                  <span className="inline-flex items-center rounded-full bg-surface/50 px-2 py-0.5 text-xs font-medium text-muted border border-border">
                                    Passport incomplete
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            
                            {/* Overflow menu */}
                            <div className="relative shrink-0" data-member-menu={m.id}>
                              <button
                                onClick={() => setOpenMenuMemberId(openMenuMemberId === m.id ? null : m.id)}
                                className="rounded-md p-2 text-muted hover:bg-background hover:text-muted"
                                aria-label="More options"
                              >
                                <svg
                                  className="h-5 w-5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                                  />
                                </svg>
                              </button>
                              {openMenuMemberId === m.id && (
                                <div className="absolute right-0 top-10 z-10 w-48 rounded-lg border border-border bg-surface shadow-lg">
                                  <div className="py-1">
                                    <button
                                      onClick={() => {
                                        handleViewPassport(m.id);
                                        setOpenMenuMemberId(null);
                                      }}
                                      className="w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-background"
                                    >
                                      View profile
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingRolesMember(m);
                                        setRolesIsAdmin(!!m.is_admin);
                                        setOpenMenuMemberId(null);
                                      }}
                                      className="w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-background"
                                    >
                                      Manage roles
                                    </button>
                                    <button
                                      onClick={() => {
                                        handleDeleteMember(m.id, name);
                                        setOpenMenuMemberId(null);
                                      }}
                                      disabled={deletingMemberId === m.id}
                                      className="w-full px-4 py-2.5 text-left text-sm text-danger hover:bg-danger-light disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {deletingMemberId === m.id ? "Deleting..." : "Delete"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Desktop: Table with kebab menu */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full min-w-[880px] text-left text-sm">
                      <colgroup>
                        <col className="w-[22%]" />
                        <col className="w-[24%]" />
                        <col className="w-[10%]" />
                        <col className="w-[10%]" />
                        <col className="w-[14%]" />
                        <col className="w-[10%]" />
                        <col className="w-[10%]" />
                      </colgroup>
                      <thead className="border-b bg-background">
                        <tr className="text-foreground">
                          <th className="px-4 py-3 font-medium">Name</th>
                          <th className="px-4 py-3 font-medium">Email</th>
                          <th className="px-4 py-3 font-medium">Nat.</th>
                          <th className="px-4 py-3 font-medium">HCP</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Passport</th>
                          <th className="px-4 py-3 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMembers.map((m) => {
                          const name = m.display_name || m.full_name || "—";
                          const passportStatus = passportStatuses[m.id];
                          const hasCompletePassport = passportStatus?.isComplete ?? false;
                          const hasPassport = passportStatus?.hasPassport ?? false;
                          const isActive = (m.status ?? "pending") === "active";

                          return (
                            <tr key={m.id} className="border-b last:border-b-0 hover:bg-background">
                              <td className="px-4 py-3 font-medium text-foreground">{name}</td>
                              <td className="px-4 py-3 text-foreground">{m.email ?? "—"}</td>
                              <td className="px-4 py-3 text-foreground">{m.nationality ?? "—"}</td>
                              <td className="px-4 py-3 text-foreground">
                                {m.declared_handicap ?? "—"}
                              </td>
                              <td className="px-4 py-3">
                                {isActive ? (
                                  <span className="inline-flex items-center rounded-full bg-brand-green-light px-2 py-1 text-xs font-medium text-brand-green">
                                    Active
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-surface/50 px-2 py-1 text-xs font-medium text-muted">
                                    Pending
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {hasCompletePassport ? (
                                  <span className="inline-flex items-center rounded-full bg-brand-green-light px-2 py-1 text-xs font-medium text-brand-green">
                                    Complete
                                  </span>
                                ) : hasPassport ? (
                                  <span className="inline-flex items-center rounded-full bg-surface/50 px-2 py-1 text-xs font-medium text-muted">
                                    Incomplete
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-background px-2 py-1 text-xs font-medium text-foreground">
                                    None
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="relative flex justify-end" data-member-menu={m.id}>
                                  <button
                                    onClick={() => setOpenMenuMemberId(openMenuMemberId === m.id ? null : m.id)}
                                    className="rounded-md p-1.5 text-muted hover:bg-background hover:text-muted"
                                    aria-label="More options"
                                  >
                                    <svg
                                      className="h-5 w-5"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                                      />
                                    </svg>
                                  </button>
                                  {openMenuMemberId === m.id && (
                                    <div className="absolute right-0 top-8 z-10 w-48 rounded-lg border border-border bg-surface shadow-lg">
                                      <div className="py-1">
                                        <button
                                          onClick={() => {
                                            handleViewPassport(m.id);
                                            setOpenMenuMemberId(null);
                                          }}
                                          className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-background"
                                        >
                                          View profile
                                        </button>
                                        <button
                                          onClick={() => {
                                            setEditingRolesMember(m);
                                            setRolesIsAdmin(!!m.is_admin);
                                            setOpenMenuMemberId(null);
                                          }}
                                          className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-background"
                                        >
                                          Manage roles
                                        </button>
                                        <button
                                          onClick={() => {
                                            handleDeleteMember(m.id, name);
                                            setOpenMenuMemberId(null);
                                          }}
                                          disabled={deletingMemberId === m.id}
                                          className="w-full px-4 py-2 text-left text-sm text-danger hover:bg-danger-light disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          {deletingMemberId === m.id ? "Deleting..." : "Delete"}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            )}
          </div>
        </>
      )}

      {/* Passport Details Modal */}
      {viewingMemberId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-2xl rounded-xl border bg-surface p-6 shadow-lg">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-foreground">Passport Details</h2>
              <button
                onClick={closePassportModal}
                className="rounded-md p-1 text-muted hover:text-muted"
              >
                ✕
              </button>
            </div>

            {loadingPassport ? (
              <div className="mt-4 text-sm text-muted">Loading passport details…</div>
            ) : passportDetails ? (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-xs font-semibold text-muted">Passport Full Name</div>
                  <div className="mt-1 text-sm text-foreground">
                    {passportDetails.passport_full_name || "—"}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-muted">Passport Number</div>
                  <div className="mt-1 text-sm text-foreground">
                    {passportDetails.passport_number || "—"}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-muted">Passport Country</div>
                  <div className="mt-1 text-sm text-foreground">
                    {passportDetails.passport_country || "—"}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-muted">Passport Expiry Date</div>
                  <div className="mt-1 text-sm text-foreground">
                    {passportDetails.passport_expiry_date
                      ? new Date(passportDetails.passport_expiry_date).toLocaleDateString("en-GB")
                      : "—"}
                  </div>
                </div>

                {passportDetails.passport_photo_url && (
                  <div>
                    <div className="text-xs font-semibold text-muted">Passport Photo</div>
                    <div className="mt-2">
                      <img
                        src={passportDetails.passport_photo_url}
                        alt="Passport photo"
                        className="max-w-full rounded-lg border border-border"
                        style={{ maxHeight: "400px" }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={closePassportModal}
                    className="rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-muted">No passport details found.</div>
            )}
          </div>
        </div>
      )}

      {/* Roles Modal */}
      {editingRolesMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-surface p-6 shadow-lg">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-foreground">Member roles</h2>
              <button
                onClick={() => setEditingRolesMember(null)}
                className="rounded-md p-1 text-muted hover:text-muted"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <div>
                <div className="text-xs font-semibold text-muted">Member</div>
                <div className="mt-1 text-foreground">
                  {editingRolesMember.display_name ||
                    editingRolesMember.full_name ||
                    editingRolesMember.email ||
                    "Member"}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                <div>
                  <div className="text-xs font-semibold text-foreground">Admin access</div>
                  <p className="mt-0.5 text-xs text-muted">
                    Admins can access the Admin area and manage trips, courses and members.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rolesIsAdmin}
                    onChange={(e) => setRolesIsAdmin(e.target.checked)}
                    disabled={savingRoles}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-background peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-green/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-green disabled:opacity-50 disabled:cursor-not-allowed"></div>
                </label>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setEditingRolesMember(null)}
                  className="rounded-md border border-brand-green bg-surface px-4 py-2 text-sm font-medium text-brand-green hover:bg-brand-green/5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRoles}
                  disabled={savingRoles}
                  className="rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  {savingRoles ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
