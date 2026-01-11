"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

type TabItem = {
  href: string;
  label: string;
  badge?: number | null;
};

type AdminTabsProps = {
  groupSlug: string;
  pendingCount?: number | null;
};

export default function AdminTabs({ groupSlug, pendingCount }: AdminTabsProps) {
  const pathname = usePathname();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // Desktop tabs (all visible)
  const allTabs: TabItem[] = [
    { href: `/admin/g/${groupSlug}`, label: "Dashboard" },
    { href: `/admin/g/${groupSlug}/trips`, label: "Trips" },
    { href: `/admin/g/${groupSlug}/members`, label: "Members", badge: pendingCount || null },
    { href: `/admin/g/${groupSlug}/courses`, label: "Courses" },
    { href: `/admin/g/${groupSlug}/group`, label: "Group" },
    { href: `/admin/g/${groupSlug}/dev-notes`, label: "Dev Notes" },
  ];

  // Mobile: visible tabs
  const mobileVisibleTabs: TabItem[] = [
    { href: `/admin/g/${groupSlug}`, label: "Dashboard" },
    { href: `/admin/g/${groupSlug}/trips`, label: "Trips" },
    { href: `/admin/g/${groupSlug}/members`, label: "Members", badge: pendingCount || null },
  ];

  // Mobile: More menu items
  const moreMenuTabs: TabItem[] = [
    { href: `/admin/g/${groupSlug}/courses`, label: "Courses" },
    { href: `/admin/g/${groupSlug}/group`, label: "Group" },
    { href: `/admin/g/${groupSlug}/dev-notes`, label: "Dev Notes" },
  ];

  function isActive(href: string): boolean {
    if (href === `/admin/g/${groupSlug}`) {
      return pathname === href;
    }
    return pathname?.startsWith(href) ?? false;
  }

  // Close more menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (moreMenuOpen && !target.closest('[data-more-menu]')) {
        setMoreMenuOpen(false);
      }
    }

    if (moreMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [moreMenuOpen]);

  return (
    <>
      {/* Desktop tabs - all visible */}
      <div className="hidden md:flex items-center gap-2">
        {allTabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive(tab.href)
                ? "bg-foreground text-white"
                : "text-foreground hover:bg-background"
            }`}
          >
            {tab.label}
            {tab.badge !== null && tab.badge !== undefined && tab.badge > 0 && (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                  isActive(tab.href)
                    ? "bg-white/20 text-white"
                    : "bg-brand-orange text-white"
                }`}
              >
                {tab.badge}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Mobile tabs - visible + More dropdown */}
      <div className="flex md:hidden items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
        {mobileVisibleTabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              isActive(tab.href)
                ? "bg-foreground text-white"
                : "text-foreground hover:bg-background"
            }`}
          >
            {tab.label}
            {tab.badge !== null && tab.badge !== undefined && tab.badge > 0 && (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                  isActive(tab.href)
                    ? "bg-white/20 text-white"
                    : "bg-brand-orange text-white"
                }`}
              >
                {tab.badge}
              </span>
            )}
          </Link>
        ))}

        {/* More dropdown */}
        <div className="relative shrink-0" data-more-menu>
          <button
            onClick={() => setMoreMenuOpen(!moreMenuOpen)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              moreMenuTabs.some((tab) => isActive(tab.href))
                ? "bg-foreground text-white"
                : "text-foreground hover:bg-background"
            }`}
          >
            More
            <svg
              className={`ml-1 inline h-4 w-4 transition-transform ${moreMenuOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {moreMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-border bg-surface shadow-lg">
              <div className="py-1">
                {moreMenuTabs.map((tab) => (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    onClick={() => setMoreMenuOpen(false)}
                    className={`block px-4 py-2 text-sm transition-colors ${
                      isActive(tab.href)
                        ? "bg-background font-medium text-foreground"
                        : "text-foreground hover:bg-background"
                    }`}
                  >
                    {tab.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
