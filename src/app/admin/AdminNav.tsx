"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function AdminNavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={[
        "rounded-lg border px-3 py-1.5 text-sm",
        active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-800",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export default function AdminNav() {
  return (
    <nav className="flex flex-wrap gap-2">
      <AdminNavLink href="/admin" label="Dashboard" />
      <AdminNavLink href="/admin/courses" label="Courses" />
    </nav>
  );
}
