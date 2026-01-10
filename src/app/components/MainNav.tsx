"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const memberNavItems = [
  { href: "/", label: "Home" },
  { href: "/trips", label: "Trips" },
  { href: "/courses", label: "Courses" },
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
        className="inline-flex items-center justify-center text-foreground hover:text-brand-green"
      >
        <span className="sr-only">Menu</span>
        <div className="space-y-1">
          <span className="block h-0.5 w-[1.1rem] rounded bg-foreground" />
          <span className="block h-0.5 w-[1.1rem] rounded bg-foreground" />
          <span className="block h-0.5 w-[1.1rem] rounded bg-foreground" />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-30 w-56 rounded-xl border border-border bg-surface">
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
                      ? "bg-brand-green/10 font-semibold text-brand-green"
                      : "text-foreground hover:bg-background"
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



