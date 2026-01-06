"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const memberNavItems = [
  { href: "/", label: "Home" },
  { href: "/trips", label: "Trips" },
  { href: "/results", label: "Results" },
  { href: "/members", label: "Members" },
  { href: "/me", label: "Me" },
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function MainNav() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open navigation menu"
        className="inline-flex items-center justify-center text-gray-700 hover:text-gray-900"
      >
        <span className="sr-only">Menu</span>
        <div className="space-y-1">
          <span className="block h-0.5 w-[1.1rem] rounded bg-gray-800" />
          <span className="block h-0.5 w-[1.1rem] rounded bg-gray-800" />
          <span className="block h-0.5 w-[1.1rem] rounded bg-gray-800" />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-30 w-56 rounded-xl border border-gray-200 bg-white shadow-lg">
          <nav className="py-2 text-sm">
            {memberNavItems.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center px-3 py-2 ${
                    active
                      ? "bg-gray-100 font-semibold text-gray-900"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}



