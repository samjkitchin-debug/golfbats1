"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../../lib/supabaseBrowser";

/**
 * This page resolves the groupSlug to groupId and redirects to the UUID-based members route.
 * This maintains consistency with the existing [groupId]/members implementation.
 */
export default function AdminMembersPage() {
  const params = useParams<{ groupSlug: string }>();
  const router = useRouter();
  const groupSlug = params?.groupSlug;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupSlug) {
      setError("Group slug is required");
      setLoading(false);
      return;
    }

    async function resolveGroupId() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error: fetchError } = await supabase
          .from("groups")
          .select("id")
          .eq("slug", groupSlug)
          .eq("is_active", true)
          .maybeSingle();

        if (fetchError || !data) {
          setError("Group not found");
          setLoading(false);
          return;
        }

        // Redirect to the UUID-based members route
        router.replace(`/admin/${data.id}/members`);
      } catch (err) {
        console.error("Error resolving group:", err);
        setError("Failed to load group");
        setLoading(false);
      }
    }

    resolveGroupId();
  }, [groupSlug, router]);

  if (loading) {
    return (
      <div className="rounded-xl border bg-surface p-8 text-center">
        <p className="text-sm text-muted">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-foreground">{error}</p>
      </div>
    );
  }

  return null; // Will redirect
}
