"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";

const memberNavItems = [
  { href: "/", label: "Home" },
  { href: "/trips", label: "Trips" },
  { href: "/clubhouse", label: "Clubhouse" },
  { href: "/members", label: "Members" },
  { href: "/courses", label: "Courses" },
  { href: "/results", label: "Results" },
  { href: "/me", label: "Me" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function MainNav() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasPendingAdminTasks, setHasPendingAdminTasks] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load admin status and pending tasks
  useEffect(() => {
    async function loadBootstrap() {
      try {
        const res = await fetch("/api/me/bootstrap", { credentials: "include" });
        if (res.ok) {
          const bootstrap = await res.json();
          const groups = bootstrap.approvedGroups || [];
          const hasAdminRole = groups.some((g: any) => g.role === "admin");
          setIsAdmin(hasAdminRole);
          setHasPendingAdminTasks(bootstrap.hasPendingAdminTasks || false);
        }
      } catch (error) {
        console.error("Failed to load bootstrap:", error);
      }
    }
    loadBootstrap();
  }, []);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
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
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-20"
            style={{ backgroundColor: "var(--overlay-scrim)" }}
            onClick={() => setOpen(false)}
            onPointerDown={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Menu */}
          <div className="absolute left-0 top-11 z-30 w-56 rounded-xl border border-border bg-surface">
            <nav className="py-2 text-sm">
              {memberNavItems.map((item) => {
                const active = isActivePath(pathname, item.href);
                const isMembersItem = item.href === "/members";
                const showPendingIndicator = isMembersItem && isAdmin && hasPendingAdminTasks;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center px-3 py-2 relative ${
                      active
                        ? "bg-ink-soft font-semibold text-primary"
                        : "text-foreground hover:bg-background"
                    }`}
                  >
                    {item.label}
                    {showPendingIndicator && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-ink-600" />
                    )}
                  </Link>
                );
              })}
              <div className="border-t border-border my-1" />
              <Link
                href="/about"
                onClick={() => setOpen(false)}
                className={`flex items-center px-3 py-2 relative ${
                  isActivePath(pathname, "/about")
                    ? "bg-ink-soft font-semibold text-primary"
                    : "text-foreground hover:bg-background"
                }`}
              >
                About
              </Link>
              <Link
                href="/privacy"
                onClick={() => setOpen(false)}
                className={`flex items-center px-3 py-2 relative ${
                  isActivePath(pathname, "/privacy")
                    ? "bg-ink-soft font-semibold text-primary"
                    : "text-foreground hover:bg-background"
                }`}
              >
                Privacy
              </Link>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}



