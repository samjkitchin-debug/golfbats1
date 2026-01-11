"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function MembersNavLink({ groupId }: { groupId: string }) {
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    async function loadPendingCount() {
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        // Count members in this group that are not active (pending)
        // Note: This counts group_members with status != 'approved', which maps to pending members
        const { count, error } = await supabase
          .from("group_members")
          .select("*", { count: "exact", head: true })
          .eq("group_id", groupId)
          .neq("status", "approved");

        if (!error && count !== null) {
          setPendingCount(count);
        }
      } catch (error) {
        console.warn("Failed to load pending count:", error);
      }
    }

    loadPendingCount();
  }, [groupId]);

  return (
    <Link
      href={`/admin/g/${groupId}/members`}
      className="rounded-md px-3 py-2 text-sm text-foreground hover:bg-background relative"
    >
      Members
      {pendingCount !== null && pendingCount > 0 && (
        <span className="ml-2 rounded-full bg-brand-orange px-2 py-0.5 text-xs font-medium text-white">
          {pendingCount}
        </span>
      )}
    </Link>
  );
}
