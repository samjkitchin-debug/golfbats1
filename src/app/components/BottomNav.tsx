"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
};

const navItems: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/trips", label: "Trips" },
  { href: "/results", label: "Results" },
  { href: "/members", label: "Members" },
  { href: "/me", label: "Me" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function BottomNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-surface border-border">
      <div className="mx-auto max-w-md px-2">
        <ul className="flex items-center justify-between">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={`block px-2 py-3 text-center text-sm ${
                    active ? "font-semibold text-brand-green" : "text-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
                <div
                  className={`mx-auto h-0.5 w-10 ${
                    active ? "bg-brand-green" : "bg-transparent"
                  }`}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
