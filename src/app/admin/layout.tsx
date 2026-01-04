"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "../components/SignOutButton";

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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="sticky top-0 z-20 border-b bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold text-gray-900">
              GolfBats
            </Link>
            <span className="text-xs text-gray-400">/ admin</span>
          </div>

          <div className="flex items-center gap-2">
            <SignOutButton />
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-4 pb-3">
          <AdminNavLink href="/admin" label="Trips" />
          <AdminNavLink href="/admin/courses" label="Courses" />
        </div>

        <div className="h-0.5 w-full bg-brand-red" />
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
