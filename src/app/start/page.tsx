"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../lib/supabaseBrowser";

export default function StartPage() {
  const router = useRouter();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupSlug, setGroupSlug] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => {
    return createSupabaseBrowserClient();
  }, []);

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setLoading(false);
    }
    checkAuth();
  }, [supabase, router]);

  async function handleCreateGroup() {
    setStatus("submitting");
    setMessage("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const trimmedName = groupName.trim();
    const trimmedSlug = groupSlug.trim().toLowerCase();

    if (!trimmedName) {
      setStatus("error");
      setMessage("Group name is required.");
      return;
    }

    if (!trimmedSlug) {
      setStatus("error");
      setMessage("Group code (slug) is required.");
      return;
    }

    // Validate slug format (alphanumeric and hyphens only)
    if (!/^[a-z0-9-]+$/.test(trimmedSlug)) {
      setStatus("error");
      setMessage("Group code can only contain lowercase letters, numbers, and hyphens.");
      return;
    }

    try {
      // Create group via API route (server-side only - no client-side inserts)
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          slug: trimmedSlug,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to create group.");
      }

      setStatus("done");
      setMessage("Group created successfully! Redirecting...");
      
      // Redirect to home after a short delay
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1500);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Failed to create group.");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-8">
        <p className="text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="text-xl font-semibold">Get Started</h1>
      <p className="mt-2 text-sm text-muted">
        You need to be part of a group to access the member area. Join an existing group or create a new one.
      </p>

      {!showCreateForm ? (
        <div className="mt-8 space-y-4">
          <Link
            href="/join"
            className="block w-full rounded-lg border-2 border-border bg-surface px-4 py-4 text-center text-sm font-semibold hover:bg-background"
          >
            Join a group
          </Link>

          <button
            onClick={() => setShowCreateForm(true)}
            className="block w-full rounded-lg border border-anticipation bg-anticipation px-4 py-4 text-center text-sm font-semibold text-anticipation-fg hover:opacity-95"
          >
            Create a group
          </button>
        </div>
      ) : (
        <div className="mt-8 rounded-lg border border-border p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Create a group</h2>
            <p className="mt-1 text-sm text-muted">
              Create a new group. You'll be added as an admin automatically.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium">Group name</label>
              <input
                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. DayForeIt Singapore"
                disabled={status === "submitting"}
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Group code</label>
              <input
                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                value={groupSlug}
                onChange={(e) => setGroupSlug(e.target.value)}
                placeholder="e.g. golfbats-sg"
                disabled={status === "submitting"}
              />
              <p className="mt-1 text-xs text-muted">
                Lowercase letters, numbers, and hyphens only. This code is used by others to join your group.
              </p>
            </div>

            {message && (
              <div className={`rounded-lg border p-3 text-sm ${
                status === "error" 
                  ? "border-danger bg-danger-light text-danger" 
                  : status === "done"
                  ? "border-anticipation bg-anticipation/10 text-anticipation"
                  : "border-border bg-surface"
              }`}>
                {message}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setGroupName("");
                  setGroupSlug("");
                  setMessage("");
                  setStatus("idle");
                }}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-background disabled:opacity-50"
                disabled={status === "submitting"}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={status === "submitting"}
                className="flex-1 rounded-lg bg-anticipation px-4 py-2 text-sm font-semibold text-anticipation-fg disabled:opacity-50"
              >
                {status === "submitting" ? "Creating..." : "Create group"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
