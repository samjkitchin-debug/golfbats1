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
        <h1 className="text-2xl font-bold text-gray-900">Members</h1>
        <p className="mt-1 text-sm text-gray-600">
          Check handicaps and connect with fellow members
        </p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, email, or nationality..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-gray-900"
        />
      </div>

      {/* Members List */}
      {loading ? (
        <div className="text-center py-8 text-sm text-gray-600">Loading members…</div>
      ) : filteredMembers.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-center">
          <p className="text-sm text-gray-600">
            {searchQuery ? "No members found matching your search." : "No members found."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredMembers.map((member) => {
            const displayName = member.display_name || member.full_name || "—";
            const handicap = member.declared_handicap;
            const photoUrl = member.profile_photo_path
              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${member.profile_photo_path}`
              : null;

            return (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3"
              >
                {/* Profile Photo */}
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={displayName}
                    className="h-12 w-12 flex-shrink-0 rounded-full object-cover border border-gray-300"
                  />
                ) : (
                  <div className="h-12 w-12 flex-shrink-0 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center text-sm font-medium text-gray-600">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Name and Handicap */}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {displayName}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    Handicap: {handicap !== null && handicap !== undefined ? handicap : "TBC"}
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
