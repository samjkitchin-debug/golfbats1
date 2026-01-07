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
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null);
  const [passportDetails, setPassportDetails] = useState<PassportDetails | null>(null);
  const [loadingPassport, setLoadingPassport] = useState(false);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);
  const [approvingMemberId, setApprovingMemberId] = useState<string | null>(null);
  const [editingRolesMember, setEditingRolesMember] = useState<MemberRow | null>(null);
  const [rolesIsAdmin, setRolesIsAdmin] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);

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

  // Filter members based on search query
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) {
      return members;
    }
    
    const query = searchQuery.toLowerCase().trim();
    return members.filter((m) => {
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
  }, [members, searchQuery]);

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

  async function handleDeleteMember(memberId: string, memberName: string) {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${memberName}? This action cannot be undone. All associated data (passport, trip attendees, etc.) will also be deleted.`
    );

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

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-10">
      <div className="mt-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Members</h1>
        <Link href="/admin" className="text-sm text-gray-700 hover:text-gray-900">
          Back to dashboard
        </Link>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">
          {error}
        </div>
      ) : loading ? (
        <div className="mt-4 rounded-xl border bg-white p-4 text-sm text-gray-700">
          Loading…
        </div>
      ) : (
        <>
          {/* Search Input */}
          <section className="mt-4 rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Search by name, email, nationality, or handicap..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-gray-400 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Clear search
                </button>
              )}
            </div>
          </section>

          {/* Admins block */}
          <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
            <div className="border-b px-4 py-3 text-sm font-semibold text-gray-900">
              Admins
            </div>
            <table className="w-full min-w-[880px] text-left text-sm">
              <colgroup>
                <col className="w-[22%]" /><col className="w-[24%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[14%]" /><col className="w-[10%]" /><col className="w-[10%]" />
              </colgroup>
              <thead className="border-b bg-white">
                <tr className="text-gray-700">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Nat.</th>
                  <th className="px-4 py-3">HCP</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Passport</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers
                  .filter((m) => m.is_admin)
                  .map((m) => {
                    const name = m.display_name || m.full_name || "—";
                    const passportStatus = passportStatuses[m.id];
                    const hasCompletePassport = passportStatus?.isComplete ?? false;
                    const hasPassport = passportStatus?.hasPassport ?? false;
                    const isActive = (m.status ?? "pending") === "active";

                    return (
                      <tr key={m.id} className="border-b last:border-b-0">
                        <td className="px-4 py-3 font-medium text-gray-900">{name}</td>
                        <td className="px-4 py-3 text-gray-800">{m.email ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-800">{m.nationality ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-800">
                          {m.declared_handicap ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {isActive ? (
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {hasCompletePassport ? (
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                              Complete
                            </span>
                          ) : hasPassport ? (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                              Incomplete
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                              None
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingRolesMember(m);
                                setRolesIsAdmin(!!m.is_admin);
                              }}
                              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Roles
                            </button>
                            <button
                              onClick={() => handleViewPassport(m.id)}
                              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              View
                            </button>
                            {!isActive && (
                              <button
                                onClick={() => handleApproveMember(m.id, name)}
                                disabled={approvingMemberId === m.id}
                                className="rounded-md border border-green-300 bg-white px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {approvingMemberId === m.id ? "Approving..." : "Approve"}
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteMember(m.id, name)}
                              disabled={deletingMemberId === m.id}
                              className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {deletingMemberId === m.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {filteredMembers.filter((m) => m.is_admin).length === 0 && (
              <div className="px-4 py-6 text-sm text-gray-700">
                {searchQuery ? "No admins match your search." : "No admins found."}
              </div>
            )}
          </div>

          {/* Non-admin members block */}
          <div className="mt-6 overflow-x-auto rounded-xl border bg-white">
            <div className="border-b px-4 py-3 text-sm font-semibold text-gray-900">
              Members
            </div>
            <table className="w-full min-w-[880px] text-left text-sm">
              <colgroup>
                <col className="w-[22%]" /><col className="w-[24%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[14%]" /><col className="w-[10%]" /><col className="w-[10%]" />
              </colgroup>
              <thead className="border-b bg-white">
                <tr className="text-gray-700">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Nat.</th>
                  <th className="px-4 py-3">HCP</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Passport</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
              {filteredMembers
                .filter((m) => !m.is_admin)
                .map((m) => {
                  const name = m.display_name || m.full_name || "—";
                  const passportStatus = passportStatuses[m.id];
                  const hasCompletePassport = passportStatus?.isComplete ?? false;
                  const hasPassport = passportStatus?.hasPassport ?? false;
                  const isActive = (m.status ?? "pending") === "active";

                  return (
                    <tr key={m.id} className="border-b last:border-b-0">
                      <td className="px-4 py-3 font-medium text-gray-900">{name}</td>
                      <td className="px-4 py-3 text-gray-800">{m.email ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-800">{m.nationality ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-800">
                        {m.declared_handicap ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {isActive ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {hasCompletePassport ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                            Complete
                          </span>
                        ) : hasPassport ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                            Incomplete
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                            None
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingRolesMember(m);
                                setRolesIsAdmin(!!m.is_admin);
                              }}
                              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Roles
                            </button>
                            <button
                              onClick={() => handleViewPassport(m.id)}
                              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              View
                            </button>
                          {!isActive && (
                            <button
                              onClick={() => handleApproveMember(m.id, name)}
                              disabled={approvingMemberId === m.id}
                              className="rounded-md border border-green-300 bg-white px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {approvingMemberId === m.id ? "Approving..." : "Approve"}
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteMember(m.id, name)}
                            disabled={deletingMemberId === m.id}
                            className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {deletingMemberId === m.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredMembers.filter((m) => !m.is_admin).length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-700">
                {searchQuery ? "No members match your search." : "No members found."}
              </div>
            ) : null}
          </div>
        </>
      )}

      {/* Passport Details Modal */}
      {viewingMemberId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-2xl rounded-xl border bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Passport Details</h2>
              <button
                onClick={closePassportModal}
                className="rounded-md p-1 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {loadingPassport ? (
              <div className="mt-4 text-sm text-gray-600">Loading passport details…</div>
            ) : passportDetails ? (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-xs font-semibold text-gray-500">Passport Full Name</div>
                  <div className="mt-1 text-sm text-gray-900">
                    {passportDetails.passport_full_name || "—"}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-500">Passport Number</div>
                  <div className="mt-1 text-sm text-gray-900">
                    {passportDetails.passport_number || "—"}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-500">Passport Country</div>
                  <div className="mt-1 text-sm text-gray-900">
                    {passportDetails.passport_country || "—"}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-500">Passport Expiry Date</div>
                  <div className="mt-1 text-sm text-gray-900">
                    {passportDetails.passport_expiry_date
                      ? new Date(passportDetails.passport_expiry_date).toLocaleDateString("en-GB")
                      : "—"}
                  </div>
                </div>

                {passportDetails.passport_photo_url && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500">Passport Photo</div>
                    <div className="mt-2">
                      <img
                        src={passportDetails.passport_photo_url}
                        alt="Passport photo"
                        className="max-w-full rounded-lg border border-gray-200"
                        style={{ maxHeight: "400px" }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={closePassportModal}
                    className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-gray-600">No passport details found.</div>
            )}
          </div>
        </div>
      )}

      {/* Roles Modal */}
      {editingRolesMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Member roles</h2>
              <button
                onClick={() => setEditingRolesMember(null)}
                className="rounded-md p-1 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <div>
                <div className="text-xs font-semibold text-gray-500">Member</div>
                <div className="mt-1 text-gray-900">
                  {editingRolesMember.display_name ||
                    editingRolesMember.full_name ||
                    editingRolesMember.email ||
                    "Member"}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <div>
                  <div className="text-xs font-semibold text-gray-700">Admin access</div>
                  <p className="mt-0.5 text-xs text-gray-600">
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
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"></div>
                </label>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setEditingRolesMember(null)}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRoles}
                  disabled={savingRoles}
                  className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
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
