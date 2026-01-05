"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type MemberRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  nationality: string | null;
  declared_handicap: number | null;
  created_at: string | null;
  last_seen: string | null;
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
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null);
  const [passportDetails, setPassportDetails] = useState<PassportDetails | null>(null);
  const [loadingPassport, setLoadingPassport] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const { data: rows, error: membersError } = await supabase
        .from("members")
        .select("id,email,full_name,display_name,nationality,declared_handicap,created_at,last_seen")
        .order("created_at", { ascending: false });

      if (membersError) {
        setError(membersError.message);
        setLoading(false);
        return;
      }

      setMembers(rows ?? []);

      // Check passport status for all members
      const memberIds = (rows ?? []).map((m) => m.id);
      if (memberIds.length > 0) {
        const { data: passports, error: passportError } = await supabase
          .from("member_passports")
          .select("user_id,passport_full_name,passport_number_encrypted,passport_country,passport_expiry_date,passport_photo_path")
          .in("user_id", memberIds);

        if (!passportError && passports) {
          const statuses: Record<string, PassportStatus> = {};
          for (const passport of passports) {
            const hasPassport = true;
            const isComplete =
              !!passport.passport_full_name &&
              !!passport.passport_number_encrypted &&
              !!passport.passport_country &&
              !!passport.passport_expiry_date;

            statuses[passport.user_id] = { memberId: passport.user_id, hasPassport, isComplete };
          }
          setPassportStatuses(statuses);
        }
      }

      setLoading(false);
    }

    load();
  }, [supabase]);

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
        <div className="mt-4 overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-white">
              <tr className="text-gray-700">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Nat.</th>
                <th className="px-4 py-3">HCP</th>
                <th className="px-4 py-3">Passport</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Last seen</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const name = m.display_name || m.full_name || "—";
                const passportStatus = passportStatuses[m.id];
                const hasCompletePassport = passportStatus?.isComplete ?? false;
                const hasPassport = passportStatus?.hasPassport ?? false;

                return (
                  <tr key={m.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-medium text-gray-900">{name}</td>
                    <td className="px-4 py-3 text-gray-800">{m.email ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-800">{m.nationality ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-800">
                      {m.declared_handicap ?? "—"}
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
                    <td className="px-4 py-3 text-gray-700">
                      {m.created_at ? new Date(m.created_at).toLocaleString("en-SG") : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {m.last_seen ? new Date(m.last_seen).toLocaleString("en-SG") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {hasPassport && (
                        <button
                          onClick={() => handleViewPassport(m.id)}
                          className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {members.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-700">No members found.</div>
          ) : null}
        </div>
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
    </main>
  );
}
