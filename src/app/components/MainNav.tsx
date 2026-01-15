"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const memberNavItems = [
  { href: "/courses", label: "Courses" },
  { href: "/me", label: "Profile" },
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
        className="inline-flex items-center justify-center text-foreground hover:text-primary"
      >
        <span className="sr-only">Menu</span>
        <div className="space-y-[4.8px]">
          <span className="block h-[2.4px] w-[1.32rem] rounded bg-foreground" />
          <span className="block h-[2.4px] w-[1.32rem] rounded bg-foreground" />
          <span className="block h-[2.4px] w-[1.32rem] rounded bg-foreground" />
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
                      ? "bg-ink-soft font-semibold text-primary"
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



