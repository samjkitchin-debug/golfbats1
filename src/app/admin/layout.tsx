"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "golfbats.isAdmin.v1";

function getExpectedPin() {
  return (process.env.NEXT_PUBLIC_ADMIN_PIN ?? "").trim();
}

function isUnlocked() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function setUnlocked(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
}

function AdminNavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname?.startsWith(href);

  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-2 text-sm ${
        active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
      }`}
    >
      {label}
    </Link>
  );
}

function AdminUnlock({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const expectedPin = useMemo(() => getExpectedPin(), []);

  function submit() {
    setError(null);

    if (!expectedPin) {
      setError(
        "Missing NEXT_PUBLIC_ADMIN_PIN. Add it to .env.local, then restart dev server."
      );
      return;
    }

    if (pin.trim() !== expectedPin) {
      setError("Incorrect PIN.");
      return;
    }

    setUnlocked(true);
    onUnlocked();
  }

  return (
    <div className="min-h-dvh bg-gray-50">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-10">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-2 text-lg font-semibold text-gray-900">Admin</div>
          <p className="text-sm text-gray-600">
            Enter the admin PIN to continue. (This is a local dev gate — not security.)
          </p>

          <div className="mt-4 flex gap-2">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Admin PIN"
              className="w-full rounded-md border px-3 py-2 text-sm"
              type="password"
              autoFocus
            />
            <button
              onClick={submit}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
            >
              Unlock
            </button>
          </div>

          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

          <div className="mt-4 text-xs text-gray-500">
            Tip: set <code className="rounded bg-gray-100 px-1">NEXT_PUBLIC_ADMIN_PIN</code>{" "}
            in <code className="rounded bg-gray-100 px-1">.env.local</code>.
          </div>
        </div>

        <Link href="/" className="text-sm text-gray-700 hover:text-gray-900">
          ← Back to GolfBats
        </Link>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlockedState] = useState(false);

  useEffect(() => {
    setUnlockedState(isUnlocked());
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!unlocked) return <AdminUnlock onUnlocked={() => setUnlockedState(true)} />;

  function lock() {
    setUnlocked(false);
    setUnlockedState(false);
  }

  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="font-semibold text-gray-900">
              Admin
            </Link>
            <span className="text-xs text-gray-400">GolfBats</span>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/" className="text-sm text-gray-700 hover:text-gray-900">
              Back to app
            </Link>
            <button
              onClick={lock}
              className="rounded-md border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Lock
            </button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-5xl px-4 pb-3">
          <nav className="flex flex-wrap gap-2">
            <AdminNavLink href="/admin" label="Dashboard" />
            <AdminNavLink href="/admin#trips" label="Trips" />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
