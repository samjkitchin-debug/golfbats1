"use client";

/* ================================
   Members Page (v1)
   - Inline edit profiles
   - Stores: nationality + initial declared handicap + fun fact
   - Shows: "Golf GameBook handicap" as a field for now (manual)
   - Passport fields are visible only to coordinator (for now hardcoded)
================================ */

import { useMemo, useState } from "react";

/* ================================
   Types
================================ */
type Role = "member" | "coordinator" | "agent";

type Member = {
  id: string;
  name: string;

  // Identity (future: from Google login)
  email?: string;

  // Profile fields you asked for
  nationality: string;
  declaredHandicapInitial: number | null;

  // This is what Golf GameBook shows (manual for now)
  gameBookHandicap: number | null;

  funFact: string;

  // Sensitive fields (coordinator/agent only)
  passportNumber: string;
  passportExpiry: string; // ISO date string "YYYY-MM-DD" (we will display as SGT context)

  createdAtUtc: string; // ISO datetime
  updatedAtUtc: string; // ISO datetime
};

/* ================================
   "Auth" placeholders (v1)
   Later: this comes from Google login + roles.
================================ */
const CURRENT_USER = {
  name: "Sam",
  role: "coordinator" as Role,
};

const CAN_VIEW_PASSPORT =
  CURRENT_USER.role === "coordinator" || CURRENT_USER.role === "agent";

/* ================================
   Fake data (v1)
================================ */
const initialMembers: Member[] = [
  {
    id: "m1",
    name: "Sam",
    email: "sam@example.com",
    nationality: "SG",
    declaredHandicapInitial: 12.5,
    gameBookHandicap: 12.1,
    funFact: "Palm Springs specialist",
    passportNumber: "E1234567A",
    passportExpiry: "2029-06-30",
    createdAtUtc: "2026-01-02T04:00:00Z",
    updatedAtUtc: "2026-01-02T04:00:00Z",
  },
  {
    id: "m2",
    name: "Alex",
    email: "alex@example.com",
    nationality: "AU",
    declaredHandicapInitial: 9.2,
    gameBookHandicap: 9.8,
    funFact: "Never lost at Batam Island Country Club",
    passportNumber: "N12345678",
    passportExpiry: "2028-11-15",
    createdAtUtc: "2026-01-02T04:00:00Z",
    updatedAtUtc: "2026-01-02T04:00:00Z",
  },
  {
    id: "m3",
    name: "Ethan",
    email: "ethan@example.com",
    nationality: "MY",
    declaredHandicapInitial: 18.0,
    gameBookHandicap: 16.2,
    funFact: "Back-nine menace",
    passportNumber: "A9876543",
    passportExpiry: "2027-02-01",
    createdAtUtc: "2026-01-02T04:00:00Z",
    updatedAtUtc: "2026-01-02T04:00:00Z",
  },
];

/* ================================
   Time helpers (Option B)
   Store UTC, display as SGT (Asia/Singapore)
================================ */
function formatUtcAsSgt(utcIso: string) {
  // Friendly display for admin; not critical for members
  const d = new Date(utcIso);
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/* ================================
   Page component
================================ */
export default function MembersPage() {
  /* ------------------------------
     State: members list
  ------------------------------ */
  const [members, setMembers] = useState<Member[]>(initialMembers);

  /* ------------------------------
     UI state: search / filter
  ------------------------------ */
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;

    return members.filter((m) => {
      return (
        m.name.toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q) ||
        m.nationality.toLowerCase().includes(q) ||
        m.funFact.toLowerCase().includes(q)
      );
    });
  }, [members, query]);

  /* ------------------------------
     Update helper (single member field)
  ------------------------------ */
  function updateMember(id: string, patch: Partial<Member>) {
    const nowUtc = new Date().toISOString();

    setMembers((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              ...patch,
              updatedAtUtc: nowUtc,
            }
          : m
      )
    );
  }

  /* ------------------------------
     Render
  ------------------------------ */
  return (
    <main className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* =========================
           Header
        ========================= */}
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">Members</h1>
          <p className="text-sm text-gray-500">
            Quick profiles (editable). Handicaps can be updated per trip later.
          </p>

          {/* Search */}
          <div className="pt-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, nationality, fun fact..."
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
            />
          </div>

          {/* Role hint */}
          <div className="text-xs text-gray-500 pt-1">
            Signed in as <span className="font-semibold">{CURRENT_USER.name}</span>{" "}
            ({CURRENT_USER.role})
            {CAN_VIEW_PASSPORT ? " — passport fields visible" : ""}
          </div>
        </header>

        {/* =========================
           Members list
        ========================= */}
        <section className="space-y-3">
          {filtered.map((m) => (
            <div key={m.id} className="bg-white rounded-lg p-4 shadow space-y-3">
              {/* --- Top row: name + timestamps --- */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-base">{m.name}</p>
                  {m.email ? (
                    <p className="text-xs text-gray-500">{m.email}</p>
                  ) : null}
                </div>

                <div className="text-right text-[11px] text-gray-400 leading-4">
                  <div>Updated</div>
                  <div>{formatUtcAsSgt(m.updatedAtUtc)} SGT</div>
                </div>
              </div>

              {/* --- Core profile fields --- */}
              <div className="grid grid-cols-2 gap-3">
                {/* Nationality */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">Nationality</label>
                  <input
                    value={m.nationality}
                    onChange={(e) =>
                      updateMember(m.id, { nationality: e.target.value })
                    }
                    className="w-full rounded border px-2 py-2 text-sm"
                    placeholder="SG / AU / MY..."
                  />
                </div>

                {/* Initial declared handicap */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">
                    Declared HCP (initial)
                  </label>
                  <input
                    value={m.declaredHandicapInitial ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      updateMember(m.id, {
                        declaredHandicapInitial: v === "" ? null : Number(v),
                      });
                    }}
                    className="w-full rounded border px-2 py-2 text-sm"
                    placeholder="e.g. 12.5"
                    inputMode="decimal"
                  />
                </div>

                {/* Golf GameBook handicap */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">
                    Golf GameBook HCP
                  </label>
                  <input
                    value={m.gameBookHandicap ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      updateMember(m.id, {
                        gameBookHandicap: v === "" ? null : Number(v),
                      });
                    }}
                    className="w-full rounded border px-2 py-2 text-sm"
                    placeholder="e.g. 11.8"
                    inputMode="decimal"
                  />
                </div>

                {/* Fun fact */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">Fun fact</label>
                  <input
                    value={m.funFact}
                    onChange={(e) => updateMember(m.id, { funFact: e.target.value })}
                    className="w-full rounded border px-2 py-2 text-sm"
                    placeholder="e.g. Palm Springs specialist"
                  />
                </div>
              </div>

              {/* --- Sensitive: passport fields (coordinator/agent only) --- */}
              {CAN_VIEW_PASSPORT ? (
                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-500">
                    Passport (Coordinator/Agent)
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-500">Number</label>
                      <input
                        value={m.passportNumber}
                        onChange={(e) =>
                          updateMember(m.id, { passportNumber: e.target.value })
                        }
                        className="w-full rounded border px-2 py-2 text-sm"
                        placeholder="Passport number"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-gray-500">Expiry</label>
                      <input
                        value={m.passportExpiry}
                        onChange={(e) =>
                          updateMember(m.id, { passportExpiry: e.target.value })
                        }
                        className="w-full rounded border px-2 py-2 text-sm"
                        placeholder="YYYY-MM-DD"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-gray-400">
                    Stored as text for v1; later we’ll validate format and export CSV after cutoff.
                  </p>
                </div>
              ) : null}
            </div>
          ))}

          {filtered.length === 0 ? (
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-sm text-gray-600">No members found.</p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

