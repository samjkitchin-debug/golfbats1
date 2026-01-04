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
  created_at: string;
  last_seen: string | null;
};

function getAdminEmails(): string[] {
  // Put this in Vercel/Env later (recommended):
  // NEXT_PUBLIC_ADMIN_EMAILS="a@x.com,b@y.com"
  const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default function MePage() {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<MemberRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userErr || !user) {
        setError("You are not signed in.");
        setMember(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const adminEmails = getAdminEmails();
      const email = (user.email ?? "").toLowerCase();
      setIsAdmin(adminEmails.includes(email));

      const { data, error: memberErr } = await supabase
        .from("members")
        .select(
          "id,email,full_name,display_name,nationality,declared_handicap,created_at,last_seen"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (memberErr) {
        setError(memberErr.message);
        setMember(null);
      } else {
        setMember((data as MemberRow) ?? null);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const titleName =
    member?.display_name?.trim() ||
    member?.full_name?.trim() ||
    member?.email?.trim() ||
    "Me";

  return (
    <div className="px-4 pb-24 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Me</h1>
          <p className="mt-1 text-sm">
            {loading ? "Loading…" : titleName}
          </p>
        </div>

        <Link
          href="/me/edit"
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
        >
          Edit
        </Link>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-black p-4">
          <p className="text-sm font-semibold">Error</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <div className="rounded-2xl border border-black p-4">
          <div className="text-sm font-semibold">Profile</div>

          <div className="mt-3 space-y-2 text-sm">
            <Row label="Email" value={member?.email ?? "—"} />
            <Row label="Full name" value={member?.full_name ?? "—"} />
            <Row label="Display name" value={member?.display_name ?? "—"} />
            <Row label="Nationality" value={member?.nationality ?? "—"} />
            <Row
              label="Declared handicap"
              value={
                member?.declared_handicap === null ||
                member?.declared_handicap === undefined
                  ? "—"
                  : String(member.declared_handicap)
              }
            />
          </div>
        </div>

        <div className="rounded-2xl border border-black p-4">
          <div className="text-sm font-semibold">Passport details</div>
          <p className="mt-2 text-sm">
            Passport details will be added once appropriate security has been
            implemented.
          </p>
        </div>

        {isAdmin ? (
          <div className="rounded-2xl border border-black p-4">
            <div className="text-sm font-semibold">Admin</div>
            <p className="mt-2 text-sm">
              Admin tools are only visible to club admins.
            </p>

            <div className="mt-3">
              <Link
                href="/admin"
                className="inline-flex rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
              >
                Go to Admin
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-semibold">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
