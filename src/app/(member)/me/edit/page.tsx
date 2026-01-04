"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

type MemberRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  nationality: string | null;
  declared_handicap: number | null;
};

type SaveBody = {
  full_name: string;
  display_name: string;
  nationality: string;
  declared_handicap: number | null;
};

export default function MeEditPage() {
  const router = useRouter();

  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [nationality, setNationality] = useState("");
  const [declaredHandicap, setDeclaredHandicap] = useState<string>("");

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
        setLoading(false);
        return;
      }

      const { data, error: memberErr } = await supabase
        .from("members")
        .select("id,email,full_name,display_name,nationality,declared_handicap")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (memberErr) {
        setError(memberErr.message);
        setLoading(false);
        return;
      }

      const m = (data as MemberRow) ?? null;

      setFullName(m?.full_name ?? "");
      setDisplayName(m?.display_name ?? "");
      setNationality(m?.nationality ?? "");
      setDeclaredHandicap(
        m?.declared_handicap === null || m?.declared_handicap === undefined
          ? ""
          : String(m.declared_handicap)
      );

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function onSave() {
    setSaving(true);
    setError(null);

    const handicapNum =
      declaredHandicap.trim() === ""
        ? null
        : Number(declaredHandicap.trim());

    if (handicapNum !== null && (Number.isNaN(handicapNum) || handicapNum < 0 || handicapNum > 54)) {
      setSaving(false);
      setError("Declared handicap must be a number between 0 and 54 (or blank).");
      return;
    }

    const body: SaveBody = {
      full_name: fullName.trim(),
      display_name: displayName.trim(),
      nationality: nationality.trim(),
      declared_handicap: handicapNum,
    };

    try {
      const res = await fetch("/me/edit/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to save profile.");
      }

      router.push("/me");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 pb-24 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Edit profile</h1>
          <p className="mt-1 text-sm">Update your details for GolfBats.</p>
        </div>

        <Link
          href="/me"
          className="rounded-xl border border-black px-4 py-2 text-sm font-semibold"
        >
          Cancel
        </Link>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-black p-4">
          <p className="text-sm font-semibold">Error</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-black p-4">
        {loading ? (
          <p className="text-sm">Loading…</p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!saving) onSave();
            }}
          >
            <Field label="Full name">
              <input
                className="w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Samuel Kitchin"
                autoComplete="name"
              />
            </Field>

            <Field label="Display name">
              <input
                className="w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Sam"
              />
            </Field>

            <Field label="Nationality">
              <input
                className="w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                placeholder="e.g. British"
              />
            </Field>

            <Field label="Declared handicap">
              <input
                className="w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
                value={declaredHandicap}
                onChange={(e) => setDeclaredHandicap(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 18.2"
              />
              <p className="mt-2 text-xs">
                This is your declared handicap for coordination purposes (not a scoring engine).
              </p>
            </Field>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
