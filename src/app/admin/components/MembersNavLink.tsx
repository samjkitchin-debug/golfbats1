"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function MembersNavLink() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    async function loadPendingCount() {
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        // Count members that are not active (pending)
        const { count, error } = await supabase
          .from("members")
          .select("*", { count: "exact", head: true })
          .or("status.neq.active,status.is.null");

        if (!error && count !== null) {
          setPendingCount(count);
        }
      } catch (error) {
        console.warn("Failed to load pending count:", error);
      }
    }

    loadPendingCount();
  }, []);

  return (
    <Link
      href="/admin/members"
      className="rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 relative"
    >
      Members
      {pendingCount !== null && pendingCount > 0 && (
        <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-medium text-white">
          {pendingCount}
        </span>
      )}
    </Link>
  );
}
