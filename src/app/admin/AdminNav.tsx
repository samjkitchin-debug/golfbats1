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
        active ? "border-brand-green bg-brand-green text-white" : "border-border bg-surface text-foreground",
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
