"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabaseBrowser";

export default function CreateGroupPage() {
  const router = useRouter();
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

  // Auto-suggest slug from group name
  useEffect(() => {
    if (groupName && !groupSlug) {
      // Generate slug from name: lowercase, replace spaces with hyphens, remove special chars
      const suggested = groupName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setGroupSlug(suggested);
    }
  }, [groupName, groupSlug]);

  // Normalize slug input (only allow [a-z0-9-])
  function handleSlugChange(value: string) {
    const normalized = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "");
    setGroupSlug(normalized);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold">Create a group</h1>
          <p className="mt-1 text-sm text-muted">
            Create a new group. You'll be added as an admin automatically.
          </p>
        </div>
        <button
          onClick={() => {
            if (window.history.length > 1) {
              router.back();
            } else {
              router.replace("/");
            }
          }}
          disabled={status === "submitting"}
          className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Group name</label>
          <input
            className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="e.g. DayForeIt Singapore"
            disabled={status === "submitting"}
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Group code</label>
          <input
            className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
            type="text"
            value={groupSlug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="e.g. golfbats-sg"
            disabled={status === "submitting"}
          />
          <p className="mt-1 text-xs text-muted">
            Lowercase letters, numbers, and hyphens only. This code is used by others to join your group.
          </p>
        </div>

        {message && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              status === "error"
                ? "border-danger bg-danger-light text-danger"
                : status === "done"
                ? "border-brand-green bg-brand-green-light text-brand-green"
                : "border-border bg-surface"
            }`}
          >
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {status === "submitting" ? "Creating..." : "Create group"}
        </button>
      </form>
    </div>
  );
}
