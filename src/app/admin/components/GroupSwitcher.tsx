"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type GroupOption = {
  id: string;
  name: string;
  slug: string;
};

type GroupSwitcherProps = {
  currentGroup: GroupOption;
  availableGroups: GroupOption[];
};

export default function GroupSwitcher({ currentGroup, availableGroups }: GroupSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-group-switcher]')) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  async function handleGroupChange(newGroupSlug: string, newGroupId: string) {
    if (newGroupSlug === currentGroup.slug || switching) return;

    setSwitching(true);
    setIsOpen(false);

    try {
      // Update last active group via API (use UUID internally)
      const res = await fetch("/api/me/active-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: newGroupId }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        console.error("Failed to update active group:", json.error);
        // Continue with navigation even if API call fails
      }

      // Preserve subpath: extract path after /admin/g/[groupSlug]
      // e.g., /admin/g/swingapore/members -> /members
      // e.g., /admin/g/swingapore/trips/456 -> /trips/456
      const pathParts = pathname.split("/");
      const gIndex = pathParts.indexOf("g");
      const groupIndex = gIndex >= 0 && gIndex + 1 < pathParts.length ? gIndex + 1 : -1;
      
      // Check if we're on a valid admin/g route structure
      let subpath = "";
      if (groupIndex >= 0 && groupIndex + 1 < pathParts.length) {
        // Extract everything after /admin/g/[groupSlug]
        subpath = "/" + pathParts.slice(groupIndex + 2).join("/");
      }

      // Navigate using slug URL
      const newPath = `/admin/g/${newGroupSlug}${subpath}`;
      router.push(newPath);
    } catch (error) {
      console.error("Error switching group:", error);
      // Still navigate even if API call fails
      const pathParts = pathname.split("/");
      const gIndex = pathParts.indexOf("g");
      const groupIndex = gIndex >= 0 && gIndex + 1 < pathParts.length ? gIndex + 1 : -1;
      
      let subpath = "";
      if (groupIndex >= 0 && groupIndex + 1 < pathParts.length) {
        subpath = "/" + pathParts.slice(groupIndex + 2).join("/");
      }
      
      router.push(`/admin/g/${newGroupSlug}${subpath}`);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="relative w-full" data-group-switcher>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={switching || availableGroups.length <= 1}
        className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto sm:justify-start"
      >
        <span className="font-medium truncate">{currentGroup.name}</span>
        {availableGroups.length > 1 && (
          <svg
            className={`h-4 w-4 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {isOpen && availableGroups.length > 1 && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-surface shadow-lg">
          <div className="max-h-64 overflow-y-auto py-1">
            {availableGroups.map((group) => (
              <button
                key={group.id}
                onClick={() => handleGroupChange(group.slug, group.id)}
                disabled={switching}
                className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                  group.slug === currentGroup.slug
                    ? "bg-background font-medium text-foreground"
                    : "text-foreground hover:bg-background"
                } disabled:opacity-50`}
              >
                <div className="font-medium">{group.name}</div>
                <div className="text-xs text-muted">Code: {group.slug}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
