"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabaseBrowser";

export default function CreateGroupPage() {
  const router = useRouter();
  const [groupName, setGroupName] = useState("");
  const [createdGroupSlug, setCreatedGroupSlug] = useState<string | null>(null);
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

  async function copyCode(slug: string) {
    try {
      await navigator.clipboard.writeText(slug);
      setMessage("Group code copied!");
      setTimeout(() => setMessage(""), 2000);
    } catch (err) {
      setMessage("Failed to copy. Please copy manually.");
    }
  }

  async function shareInvite(slug: string) {
    const inviteLink = `${window.location.origin}/join?code=${slug}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Join ${groupName} on DayForeIt`,
          text: `Join my group "${groupName}" on DayForeIt`,
          url: inviteLink,
        });
      } else {
        await navigator.clipboard.writeText(inviteLink);
        setMessage("Invite link copied!");
        setTimeout(() => setMessage(""), 2000);
      }
    } catch (err) {
      // User cancelled share or error - try copy as fallback
      try {
        await navigator.clipboard.writeText(inviteLink);
        setMessage("Invite link copied!");
        setTimeout(() => setMessage(""), 2000);
      } catch (copyErr) {
        setMessage("Failed to share. Please copy manually.");
      }
    }
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

    if (!trimmedName) {
      setStatus("error");
      setMessage("Group name is required.");
      return;
    }

    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to create group.");
      }

      // Store the created slug
      setCreatedGroupSlug(json.group?.slug || null);
      setStatus("done");
      setMessage("Group created successfully!");
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

      {status === "done" && createdGroupSlug ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-sm font-medium text-foreground mb-1">Group code</div>
            <div className="font-mono text-lg font-semibold text-foreground mb-4">
              {createdGroupSlug}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => copyCode(createdGroupSlug)}
                className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background transition-colors"
              >
                Copy code
              </button>
              <button
                onClick={() => shareInvite(createdGroupSlug)}
                className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
              >
                Share invite
              </button>
            </div>
          </div>

          {message && (
            <div className="rounded-lg border border-border bg-surface p-3 text-sm text-foreground">
              {message}
            </div>
          )}

          <button
            onClick={() => {
              router.push("/");
              router.refresh();
            }}
            className="w-full rounded-lg btn-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Continue
          </button>
        </div>
      ) : (
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
            <p className="mt-1 text-xs text-muted">
              A group code will be generated automatically.
            </p>
          </div>

          {message && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                status === "error"
                  ? "border-danger bg-danger-light text-danger"
                  : "border-border bg-surface text-foreground"
              }`}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full rounded-lg btn-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {status === "submitting" ? "Creating..." : "Create group"}
          </button>
        </form>
      )}
    </div>
  );
}
